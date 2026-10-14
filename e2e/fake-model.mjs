#!/usr/bin/env node
/**
 * A stand-in for Ollama, so the end-to-end tests can drive the whole app without a real model.
 *
 * It answers the few Ollama endpoints Torvaix calls and plays the model's part with fixed rules,
 * so every run takes the same steps:
 *
 * - The router's question ("Classify this user request") gets the category the wording implies.
 * - A recall gets back the first memory Torvaix retrieved.
 * - An execution step follows the task text:
 *     "create a file named NAME with text TEXT"  -> write_file, then done
 *     "read the file NAME"                         -> read_file, then done with what it read
 *     "run the command `CMD`"                      -> bash CMD, then done with its output
 * - Anything else is answered with "Fake model reply: <the request>".
 *
 * It answers the way local models often do, not the tidy way a prompt asks for: the category
 * comes as "Category: **knowledge**.", and chat replies stream in small pieces after a
 * thinking model's <think>…</think> reasoning. GET /fake/requests lists what Torvaix sent
 * (kind of call, options, format, prompt size), so tests can check the context window.
 *
 * Listens on FAKE_MODEL_PORT (default 11435, so a real Ollama on 11434 is left alone).
 */
import http from 'node:http';

const PORT = Number(process.env.FAKE_MODEL_PORT) || 11435;
export const MODEL = 'llama3.2:latest';

const lastUser = (messages) => [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';

function classify(request) {
  const text = request.toLowerCase();
  if (/\b(remember that|note that|keep in mind|my favou?rite \w+ is)\b/.test(text)) return 'knowledge';
  if (/\b(what is my|what's my|do you remember|recall)\b/.test(text)) return 'memory';
  if (/\b(create a file|read the file|run the command|list the files)\b/.test(text)) return 'execution';
  return 'conversation';
}

/** The tool results so far, from the History block of an execution prompt. */
function historyOf(prompt) {
  const start = prompt.indexOf('History:');
  if (start === -1) return '';
  const end = prompt.indexOf('CRITICAL RULES:', start);
  return prompt.slice(start + 'History:'.length, end === -1 ? undefined : end).trim();
}

function step(task, history) {
  const json = (value) => JSON.stringify(value);
  const done = (message) => json({ thought: 'The task is finished.', done: true, message });
  const ran = (tool) => history.includes(tool);

  let m = task.match(/create a file named (\S+) with text (.+)$/i);
  if (m) {
    if (!ran('write_file')) return json({ thought: `Write ${m[1]}.`, done: false, tool: 'write_file', args: { filePath: m[1], content: m[2] } });
    return done(`Created ${m[1]}.`);
  }
  m = task.match(/read the file (\S+)/i);
  if (m) {
    if (!ran('read_file')) return json({ thought: `Read ${m[1]}.`, done: false, tool: 'read_file', args: { filePath: m[1] } });
    return done(`The file says: ${history.replace(/\s+/g, ' ').slice(-300)}`);
  }
  m = task.match(/run the command `([^`]+)`/i);
  if (m) {
    if (!ran('bash')) return json({ thought: `Run ${m[1]}.`, done: false, tool: 'bash', args: { command: m[1] } });
    return done(`The command printed: ${history.replace(/\s+/g, ' ').slice(-300)}`);
  }
  return done(`Fake model reply: ${task}`);
}

export function reply(messages) {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const prompt = lastUser(messages);

  if (/query classifier/i.test(system)) {
    const request = prompt.match(/REQUEST: "([\s\S]*?)"\n/)?.[1] ?? prompt;
    return `Category: **${classify(request)}**.`;
  }
  if (/Execution Agent/.test(prompt)) {
    const task = prompt.match(/Current task: "([\s\S]*?)"\n/)?.[1] ?? '';
    return step(task, historyOf(prompt));
  }
  const memories = prompt.match(/\n\nSaved memories:\n([\s\S]*)$/);
  if (memories) {
    const first = memories[1].split('\n')[0].replace(/^- /, '').replace(/ \(saved \d{4}-\d{2}-\d{2}\)$/, '');
    return `From your memories: ${first}`;
  }
  const asked = prompt.match(/The user asked: "([\s\S]*?)"/)?.[1];
  return `Fake model reply: ${(asked ?? prompt).split('\n')[0].slice(0, 200)}`;
}

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

/** What Torvaix asked for, most recent last. */
const requests = [];

function kindOf(messages) {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  if (/query classifier/i.test(system)) return 'router';
  if (/Execution Agent/.test(lastUser(messages))) return 'execution';
  return 'chat';
}

/** A reply in pieces, the way a model writes it. */
const pieces = (text) => text.match(/[\s\S]{1,12}/g) ?? [''];

const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (chunk) => (raw += chunk));
  req.on('end', () => {
    if (req.url === '/api/tags') return send(res, 200, { models: [{ name: MODEL, model: MODEL, size: 2_000_000_000 }] });
    if (req.url === '/api/ps') return send(res, 200, { models: [] });
    if (req.url === '/fake/requests') return send(res, 200, { requests });
    if (req.url === '/api/version') return send(res, 200, { version: '0.0.0-fake' });
    if (req.url === '/api/chat' && req.method === 'POST') {
      let body;
      try {
        body = JSON.parse(raw || '{}');
      } catch {
        return send(res, 400, { error: 'invalid JSON' });
      }
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const promptChars = messages.reduce((n, m) => n + String(m.content ?? '').length, 0);
      requests.push({ kind: kindOf(messages), stream: Boolean(body.stream), format: body.format ?? null, options: body.options ?? {}, promptChars });
      if (requests.length > 200) requests.shift();
      const text = reply(messages);
      if (!body.stream) return send(res, 200, { model: body.model, message: { role: 'assistant', content: text }, done: true });
      const lines = [
        ...pieces(`<think>The user said something. I should answer it.</think>\n\n${text}`).map((piece) => ({
          model: body.model,
          message: { role: 'assistant', content: piece },
          done: false,
        })),
        { model: body.model, message: { role: 'assistant', content: '' }, done: true },
      ];
      return send(res, 200, lines.map((l) => JSON.stringify(l)).join('\n') + '\n', 'application/x-ndjson');
    }
    send(res, 404, { error: 'not found' });
  });
});

server.listen(PORT, '127.0.0.1', () => console.log(`Fake model listening on http://127.0.0.1:${PORT}`));
