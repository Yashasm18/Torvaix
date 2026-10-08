import { describe, it, expect, vi, beforeEach } from 'vitest';

const callTool = vi.fn(async (tool: string, args: any) => ({ content: [{ type: 'text', text: `ran ${tool} ${JSON.stringify(args)}` }] }));
vi.mock('@torvaix/mcp', () => ({ getMcpClient: () => ({ callTool }) }));

import { MemoryStore } from '@torvaix/memory';
import { AgentOrchestrator, type AgentPersona } from '../orchestrator';
import { AGENT_TOOLS, isAgentToolId, listAgentToolInfo, normalizeAgentTools } from '../agent-tools';
import { validateAgentInput, validateAgentUpdate, validateAutomationInput, LIMITS } from '../validation';

/** An LLM that returns the scripted replies in order, then says it is done. */
function scriptedLlm(replies: string[]) {
  return {
    complete: vi.fn(async () => ({ text: replies.shift() ?? '{"done": true, "message": "finished"}' })),
    getDefaultModel: () => 'test-model',
  } as any;
}

type Sent = { role: string; content: string }[];
const sentTo = (llm: any, call = 0): Sent => llm.complete.mock.calls[call][1];
const allText = (llm: any, call = 0) => sentTo(llm, call).map(m => m.content).join('\n');
const executionPrompt = (llm: any, call = 0) => sentTo(llm, call).find(m => m.role === 'user')!.content;
/** Just the part of the execution prompt that lists the tools. */
const toolSection = (llm: any, call = 0) => executionPrompt(llm, call).split('Available tools:\n')[1].split('\n\nCurrent task:')[0];

const persona = (tools: string[], overrides: Partial<AgentPersona> = {}): AgentPersona => ({
  name: 'Release helper',
  instructions: 'Always sign off with the word Cheers.',
  tools,
  ...overrides,
});

const newStore = () => new MemoryStore(':memory:', { ollamaUrl: 'http://127.0.0.1:1', qdrantUrl: 'http://127.0.0.1:1' });
const runExecution = (agent: AgentOrchestrator, instructions = 'do the task', extra: object = {}) =>
  agent.run({ workspaceId: 'default', instructions, nextNode: 'execution', ...extra } as any);

// The tool list as the execution prompt has always written it.
const ORIGINAL_TOOL_LINES = [
  '- write_file: Write content to a file. Args: {"filePath": "path", "content": "file content"}',
  '- read_file: Read a file. Args: {"filePath": "path"}',
  '- bash: Run a shell command. Args: {"command": "shell command"}',
  '- python: Execute Python code. Args: {"code": "python code"}',
  '- web_search: Search the web. Args: {"query": "search query"}',
  '- repo_scan: Scan the workspace architecture and dependencies. Args: {}',
];

describe('tool catalogue', () => {
  it('lists the six tools with the prompt lines chat has always used', () => {
    expect(AGENT_TOOLS.map(t => t.promptLine)).toEqual(ORIGINAL_TOOL_LINES);
    expect(AGENT_TOOLS.map(t => t.id).sort()).toEqual(['bash', 'python', 'read_file', 'repo_scan', 'web_search', 'write_file']);
  });

  it('asks for approval before bash and python, and nothing else', () => {
    expect(AGENT_TOOLS.filter(t => t.needsApproval).map(t => t.id)).toEqual(['bash', 'python']);
  });

  it('gives people a label and a description for every tool, and keeps the prompt line to the model', () => {
    for (const info of listAgentToolInfo()) {
      expect(info.label.length).toBeGreaterThan(0);
      expect(info.description.length).toBeGreaterThan(0);
      expect(info).not.toHaveProperty('promptLine');
    }
    expect(listAgentToolInfo().map(t => t.id)).toEqual(AGENT_TOOLS.map(t => t.id));
  });

  it('recognises tool ids', () => {
    expect(isAgentToolId('bash')).toBe(true);
    expect(isAgentToolId('Bash')).toBe(false);
    expect(isAgentToolId('teleport')).toBe(false);
    expect(isAgentToolId(42)).toBe(false);
  });

  it('keeps known ids, drops repeats, and uses the catalogue order', () => {
    expect(normalizeAgentTools(['repo_scan', 'read_file', 'nope', 'repo_scan', 7, 'bash'])).toEqual(['read_file', 'bash', 'repo_scan']);
    expect(normalizeAgentTools([])).toEqual([]);
    expect(normalizeAgentTools('bash')).toEqual([]);
    expect(normalizeAgentTools(undefined)).toEqual([]);
  });
});

describe('what the model is told', () => {
  let store: MemoryStore;
  beforeEach(() => {
    callTool.mockClear();
    store = newStore();
  });

  it('keeps the tool list of normal chat exactly as it was', async () => {
    const llm = scriptedLlm([]);
    await runExecution(new AgentOrchestrator(store, { llm, model: 'test-model' }));

    expect(toolSection(llm)).toBe(ORIGINAL_TOOL_LINES.join('\n'));
    expect(allText(llm)).not.toContain('Instructions for this agent');
    expect(allText(llm)).not.toContain('Use only these tools');
  });

  it('lists only the tools an agent has', async () => {
    const llm = scriptedLlm([]);
    await runExecution(new AgentOrchestrator(store, { llm, model: 'test-model', persona: persona(['web_search', 'read_file']) }));

    const section = toolSection(llm);
    expect(section).toContain('- read_file:');
    expect(section).toContain('- web_search:');
    for (const gone of ['write_file', 'bash', 'python', 'repo_scan']) expect(section).not.toContain(`- ${gone}:`);
    expect(section).toContain('Use only these tools');
  });

  it('ignores tool ids it does not know', async () => {
    const llm = scriptedLlm([]);
    await runExecution(new AgentOrchestrator(store, { llm, model: 'test-model', persona: persona(['read_file', 'teleport']) }));

    expect(toolSection(llm)).not.toContain('teleport');
    expect(toolSection(llm)).toContain('- read_file:');
  });

  it('says no tools are available when an agent has none', async () => {
    const llm = scriptedLlm([]);
    await runExecution(new AgentOrchestrator(store, { llm, model: 'test-model', persona: persona([]) }));

    expect(toolSection(llm)).toMatch(/No tools are available\. Answer the task directly/);
    expect(toolSection(llm)).not.toContain('- ');
  });

  it('passes the agent\'s instructions to the model, marked as the user\'s, next to the Torvaix prompt', async () => {
    const llm = scriptedLlm([]);
    await runExecution(new AgentOrchestrator(store, { llm, model: 'test-model', persona: persona(['read_file']) }));

    const system = sentTo(llm).find(m => m.role === 'system')!.content;
    expect(system).toContain('Your name is Torvaix');
    expect(system).toContain('The user set up this agent, "Release helper"');
    expect(system).toContain('Always sign off with the word Cheers.');
  });

  it('passes the instructions into a plain conversation too', async () => {
    const llm = scriptedLlm(['conversation', 'Attention lets a model weigh words. Cheers.']);
    const agent = new AgentOrchestrator(store, { llm, model: 'test-model', persona: persona([]) });
    const state = await agent.run({ workspaceId: 'default', instructions: 'Explain how transformers work' });

    expect(state.pulse.route).toBe('conversation');
    expect(sentTo(llm, 1)[0].content).toContain('Always sign off with the word Cheers.');
    expect(sentTo(llm, 1)[0].content).toContain('Your name is Torvaix');
    expect(state.output).toContain('Cheers');
  });

  it('passes the instructions into a memory answer too', async () => {
    await store.storeMemory('default', 'My favorite framework is Next.js', 'User Chat');
    const llm = scriptedLlm(['Next.js. Cheers.']);
    const agent = new AgentOrchestrator(store, { llm, model: 'test-model', persona: persona([]) });
    const state = await agent.run({ workspaceId: 'default', instructions: 'Do you remember my favorite framework?' });

    expect(state.pulse.route).toBe('memory');
    expect(sentTo(llm)[0].content).toContain('Always sign off with the word Cheers.');
  });

  it('adds nothing to chat\'s system messages when there is no agent', async () => {
    const llm = scriptedLlm(['conversation', 'Fine.']);
    await new AgentOrchestrator(store, { llm, model: 'test-model' }).run({ workspaceId: 'default', instructions: 'Explain how transformers work' });

    expect(sentTo(llm, 1)[0].content).not.toContain('set up this agent');
  });

  it('names the agent in the pulse, and nobody for Torvaix itself', async () => {
    const withAgent = await runExecution(new AgentOrchestrator(store, { llm: scriptedLlm([]), model: 'test-model', persona: persona(['read_file']) }));
    const without = await runExecution(new AgentOrchestrator(store, { llm: scriptedLlm([]), model: 'test-model' }));

    expect(withAgent.pulse.agent).toBe('Release helper');
    expect(without.pulse.agent).toBeNull();
  });
});

describe('an agent only uses its own tools', () => {
  let store: MemoryStore;
  beforeEach(() => {
    callTool.mockReset();
    callTool.mockImplementation(async (tool: string, args: any) => ({ content: [{ type: 'text', text: `ran ${tool} ${JSON.stringify(args)}` }] }));
    store = newStore();
  });

  it('runs a tool the agent has', async () => {
    const llm = scriptedLlm([
      '{"done": false, "tool": "read_file", "args": {"filePath": "notes.md"}}',
      '{"done": true, "message": "Read it."}',
    ]);
    const state = await runExecution(new AgentOrchestrator(store, { llm, model: 'test-model', persona: persona(['read_file']) }));

    expect(callTool).toHaveBeenCalledWith('read_file', { filePath: 'notes.md' });
    expect(state.output).toBe('Read it.');
    expect(state.error).toBeUndefined();
  });

  it('never runs a tool the agent does not have, and tells the model once so it can try again', async () => {
    const llm = scriptedLlm([
      '{"done": false, "tool": "write_file", "args": {"filePath": "a.txt", "content": "x"}}',
      '{"done": true, "message": "I cannot write files, but here is the text."}',
    ]);
    const state = await runExecution(new AgentOrchestrator(store, { llm, model: 'test-model', persona: persona(['read_file', 'web_search']) }));

    expect(callTool).not.toHaveBeenCalled();
    expect(llm.complete).toHaveBeenCalledTimes(2);
    const retry = executionPrompt(llm, 1);
    expect(retry).toContain('Tool not available: write_file');
    expect(retry).toContain('Your tools are: read_file, web_search');
    expect(state.output).toBe('I cannot write files, but here is the text.');
    expect(state.error).toBeUndefined();
  });

  it('creates no approval request for bash or python when the agent does not have them', async () => {
    for (const [tool, args] of [['bash', '{"command": "ls"}'], ['python', '{"code": "print(1)"}']]) {
      const llm = scriptedLlm([`{"done": false, "tool": "${tool}", "args": ${args}}`]);
      const state = await runExecution(new AgentOrchestrator(store, { llm, model: 'test-model', persona: persona(['read_file']) }));

      expect(state.pendingActionId).toBeUndefined();
      expect(state.pulse.awaitingApproval).toBeNull();
    }
    expect(store.listPendingActions('default')).toHaveLength(0);
    expect(callTool).not.toHaveBeenCalled();
  });

  it('ends the run with a clear message when the model asks again for a tool it may not use', async () => {
    const llm = {
      complete: vi.fn(async () => ({ text: '{"done": false, "tool": "python", "args": {"code": "print(1)"}}' })),
      getDefaultModel: () => 'test-model',
    } as any;
    const state = await runExecution(new AgentOrchestrator(store, { llm, model: 'test-model', persona: persona(['read_file']) }));

    expect(llm.complete).toHaveBeenCalledTimes(2);
    expect(callTool).not.toHaveBeenCalled();
    expect(store.listPendingActions('default')).toHaveLength(0);
    expect(state.output).toBe("I could not finish this: python is not one of this agent's tools. It can use: read_file.");
    expect(state.error).toBe(state.output);
  });

  it('refuses every tool when the agent has none', async () => {
    const llm = scriptedLlm([
      '{"done": false, "tool": "read_file", "args": {"filePath": "a.txt"}}',
      '{"done": false, "tool": "read_file", "args": {"filePath": "a.txt"}}',
    ]);
    const state = await runExecution(new AgentOrchestrator(store, { llm, model: 'test-model', persona: persona([]) }));

    expect(callTool).not.toHaveBeenCalled();
    expect(executionPrompt(llm, 1)).toContain('this agent has no tools');
    expect(state.output).toBe("I could not finish this: this agent has no tools, so it can't use read_file.");
  });

  it('still asks before running bash for an agent that has it', async () => {
    const llm = scriptedLlm(['{"done": false, "tool": "bash", "args": {"command": "echo hi"}}']);
    const state = await runExecution(new AgentOrchestrator(store, { llm, model: 'test-model', persona: persona(['bash']) }));

    expect(callTool).not.toHaveBeenCalled();
    expect(state.pendingActionId).toBeTruthy();
    expect(state.pulse.awaitingApproval).toBe('bash');
    expect(store.getPendingAction(state.pendingActionId!)?.status).toBe('pending');
  });

  it('runs an approved command for an agent that has the tool, and the next one needs its own approval', async () => {
    const approvedId = store.createPendingAction('default', 'bash', { command: 'echo hi' });
    store.updatePendingActionStatus(approvedId, 'approved');
    const llm = scriptedLlm(['{"done": false, "tool": "bash", "args": {"command": "echo again"}}']);
    const state = await new AgentOrchestrator(store, { llm, model: 'test-model', persona: persona(['bash']) })
      .run({ workspaceId: 'default', instructions: 'say hi twice', messages: [], pendingActionId: approvedId });

    expect(callTool).toHaveBeenCalledTimes(1);
    expect(callTool).toHaveBeenCalledWith('bash', { command: 'echo hi' });
    expect(state.pendingActionId).toBeTruthy();
    expect(state.pendingActionId).not.toBe(approvedId);
  });

  it('refuses an approved action for a tool the agent does not have, and leaves the approval unclaimed', async () => {
    const approvedId = store.createPendingAction('default', 'bash', { command: 'rm -rf important' });
    store.updatePendingActionStatus(approvedId, 'approved');
    const llm = scriptedLlm([]);

    const state = await new AgentOrchestrator(store, { llm, model: 'test-model', persona: persona(['read_file']) })
      .run({ workspaceId: 'default', instructions: 'clean up', pendingActionId: approvedId });

    expect(callTool).not.toHaveBeenCalled();
    expect(llm.complete).not.toHaveBeenCalled();
    expect(store.getPendingAction(approvedId)?.status).toBe('approved');
    expect(state.output).toBe("The action was not run: bash is not one of this agent's tools.");
    expect(state.error).toBe(state.output);
    expect(state.pendingActionId).toBeUndefined();

    // Still unclaimed, so an agent that does have bash can use it.
    await new AgentOrchestrator(store, { llm: scriptedLlm([]), model: 'test-model', persona: persona(['bash']) })
      .run({ workspaceId: 'default', instructions: '', pendingActionId: approvedId });
    expect(callTool).toHaveBeenCalledWith('bash', { command: 'rm -rf important' });
    expect(store.getPendingAction(approvedId)?.status).toBe('executed');
  });

  it('keeps a repo scan out of reach of an agent without that tool', async () => {
    const llm = scriptedLlm(['{"done": true, "message": "I have no scan tool."}']);
    const state = await new AgentOrchestrator(store, { llm, model: 'test-model', persona: persona(['read_file']) })
      .run({ workspaceId: 'default', instructions: 'analyze the repo' });

    expect(callTool).not.toHaveBeenCalled();
    expect(state.pulse.route).toBe('execution');
    expect(state.output).toBe('I have no scan tool.');
  });

  it('still scans the repo for an agent that has the tool', async () => {
    callTool.mockResolvedValueOnce({ content: [{ type: 'text', text: 'Package: demo\nDependencies: none\nStructure: src/' }] });
    const state = await new AgentOrchestrator(store, { llm: scriptedLlm([]), model: 'test-model', persona: persona(['repo_scan']) })
      .run({ workspaceId: 'default', instructions: 'analyze the repo' });

    expect(callTool).toHaveBeenCalledWith('repo_scan', {});
    expect(state.pulse.route).toBe('repo_analysis');
    expect(state.output).toContain('**Package:** demo');
  });

  it('leaves normal chat free to use any tool', async () => {
    const llm = scriptedLlm([
      '{"done": false, "tool": "write_file", "args": {"filePath": "a.txt", "content": "x"}}',
      '{"done": true, "message": "Written."}',
    ]);
    await runExecution(new AgentOrchestrator(store, { llm, model: 'test-model' }));

    expect(callTool).toHaveBeenCalledWith('write_file', { filePath: 'a.txt', content: 'x' });
  });

  it('reports a failed model call as an error run', async () => {
    const llm = { complete: vi.fn(async () => { throw new Error('model is down'); }), getDefaultModel: () => 'test-model' } as any;
    const state = await runExecution(new AgentOrchestrator(store, { llm, model: 'test-model', persona: persona(['read_file']) }));

    expect(state.output).toBe('LLM Error: model is down');
    expect(state.error).toBe('LLM Error: model is down');
  });
});

describe('asking an agent who it is', () => {
  const FIXED_ANSWER = 'I am Torvaix, your workspace-first AI Operating System.';
  let store: MemoryStore;
  beforeEach(() => {
    callTool.mockClear();
    store = newStore();
  });

  it.each(['Who are you?', "what's your name", 'What is your name?'])('lets an agent answer "%s" in its own voice, with the model', async question => {
    const llm = scriptedLlm(['I am the Release helper. Cheers.']);
    const state = await new AgentOrchestrator(store, { llm, model: 'test-model', persona: persona([]) }).run({ workspaceId: 'default', instructions: question });

    expect(llm.complete).toHaveBeenCalledTimes(1);
    expect(state.pulse.route).toBe('conversation');
    expect(state.output).toBe('I am the Release helper. Cheers.');
    expect(sentTo(llm)[0].content).toContain('Always sign off with the word Cheers.');
    expect(sentTo(llm).at(-1)!.content).toBe(question);
  });

  it('still gives the fixed answer without calling the model when there is no agent', async () => {
    const llm = scriptedLlm(['This should never be asked for.']);
    const state = await new AgentOrchestrator(store, { llm, model: 'test-model' }).run({ workspaceId: 'default', instructions: 'Who are you?' });

    expect(llm.complete).not.toHaveBeenCalled();
    expect(state.pulse.route).toBe('identity');
    expect(state.output).toBe(FIXED_ANSWER);
  });

  it('leaves the other quick routes of an agent as they were', async () => {
    await store.storeMemory('default', 'My favorite framework is Next.js', 'User Chat');
    const llm = scriptedLlm(['Next.js. Cheers.']);
    const state = await new AgentOrchestrator(store, { llm, model: 'test-model', persona: persona([]) })
      .run({ workspaceId: 'default', instructions: 'Do you remember my favorite framework?' });

    expect(state.pulse.route).toBe('memory');
    expect(llm.complete).toHaveBeenCalledTimes(1);
  });
});

describe('what an agent remembers', () => {
  let store: MemoryStore;
  beforeEach(() => {
    callTool.mockClear();
    store = newStore();
  });

  it('adds saved memories that match the task to the prompt and lists them in the pulse', async () => {
    await store.storeMemory('default', 'The project deadline is Friday', 'User Chat');
    const llm = scriptedLlm([]);
    const state = await runExecution(
      new AgentOrchestrator(store, { llm, model: 'test-model', persona: persona(['read_file']) }),
      'When is the project deadline?'
    );

    expect(executionPrompt(llm)).toContain('Things you remember about this user');
    expect(executionPrompt(llm)).toContain('- The project deadline is Friday');
    expect(state.pulse.retrievedMemories).toHaveLength(1);
    expect(state.pulse.retrievedMemories[0]).toMatchObject({ content: 'The project deadline is Friday', source: 'User Chat', match: 'keyword' });
    expect(state.pulse.retrievedMemories[0].score).toBeGreaterThan(0.4);
  });

  it('leaves memories out of normal chat\'s execution prompt', async () => {
    await store.storeMemory('default', 'The project deadline is Friday', 'User Chat');
    const llm = scriptedLlm([]);
    await runExecution(new AgentOrchestrator(store, { llm, model: 'test-model' }), 'When is the project deadline?');

    expect(executionPrompt(llm)).not.toContain('deadline is Friday');
  });

  it('looks memories up once per run, not at every step', async () => {
    const query = vi.spyOn(store, 'queryMemory');
    const llm = scriptedLlm([
      '{"done": false, "tool": "read_file", "args": {"filePath": "a.txt"}}',
      '{"done": false, "tool": "read_file", "args": {"filePath": "b.txt"}}',
    ]);
    await runExecution(new AgentOrchestrator(store, { llm, model: 'test-model', persona: persona(['read_file']) }));

    expect(llm.complete).toHaveBeenCalledTimes(3);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith('default', 'do the task', 3);
  });

  it('keeps only memories that match well', async () => {
    vi.spyOn(store, 'queryMemory').mockResolvedValue([
      { id: 'a', content: 'A close match', source: 'User Chat', score: 0.9, retrievalType: 'vector' },
      { id: 'b', content: 'A weak match', source: 'User Chat', score: 0.3, retrievalType: 'vector' },
    ]);
    const llm = scriptedLlm([]);
    const state = await runExecution(new AgentOrchestrator(store, { llm, model: 'test-model', persona: persona(['read_file']) }));

    expect(executionPrompt(llm)).toContain('A close match');
    expect(executionPrompt(llm)).not.toContain('A weak match');
    expect(state.pulse.retrievedMemories.map(m => m.id)).toEqual(['a']);
  });

  it('does not fail the run when the memory lookup fails', async () => {
    vi.spyOn(store, 'queryMemory').mockRejectedValue(new Error('index is broken'));
    const llm = scriptedLlm(['{"done": true, "message": "Done anyway."}']);
    const state = await runExecution(new AgentOrchestrator(store, { llm, model: 'test-model', persona: persona(['read_file']) }));

    expect(state.output).toBe('Done anyway.');
    expect(state.error).toBeUndefined();
    expect(state.pulse.retrievedMemories).toEqual([]);
  });

  it('shortens a very long memory in the prompt', async () => {
    vi.spyOn(store, 'queryMemory').mockResolvedValue([{ id: 'a', content: 'long '.repeat(2000), source: 'User Chat', score: 1, retrievalType: 'keyword' }]);
    const llm = scriptedLlm([]);
    await runExecution(new AgentOrchestrator(store, { llm, model: 'test-model', persona: persona(['read_file']) }));

    expect(executionPrompt(llm).length).toBeLessThan(6000);
  });
});

describe('checking an agent before it is saved', () => {
  const valid = { name: 'Notes helper', description: 'Keeps notes tidy', instructions: 'Tidy the notes.', tools: ['read_file', 'write_file'] };

  it('accepts a complete agent and returns it cleaned up', () => {
    const result = validateAgentInput({
      name: '  Notes helper  ',
      description: '  Keeps notes tidy ',
      instructions: '\n Tidy the notes. \n',
      tools: ['write_file', 'read_file', 'write_file'],
    });

    expect(result.error).toBeUndefined();
    expect(result.value).toEqual({ name: 'Notes helper', description: 'Keeps notes tidy', instructions: 'Tidy the notes.', tools: ['write_file', 'read_file'] });
  });

  it('puts the tools in catalogue order and removes repeats', () => {
    expect(validateAgentInput({ ...valid, tools: ['repo_scan', 'bash', 'repo_scan', 'read_file'] }).value?.tools).toEqual(['read_file', 'bash', 'repo_scan']);
  });

  it('treats the description as optional, and an agent with no tools as fine', () => {
    const { description: _description, ...withoutDescription } = valid;

    expect(validateAgentInput({ ...withoutDescription, tools: [] }).value).toMatchObject({ description: '', tools: [] });
  });

  it('accepts the longest name, description and instructions', () => {
    const result = validateAgentInput({
      name: 'n'.repeat(LIMITS.agentNameChars),
      description: 'd'.repeat(LIMITS.agentDescriptionChars),
      instructions: 'i'.repeat(LIMITS.agentInstructionsChars),
      tools: [],
    });

    expect(result.error).toBeUndefined();
    expect([LIMITS.agentNameChars, LIMITS.agentDescriptionChars, LIMITS.agentInstructionsChars, LIMITS.agentsPerWorkspace]).toEqual([80, 300, 4000, 50]);
  });

  it('measures a name after trimming: 80 characters with spaces around it is fine, 81 is too long', () => {
    const padded = (length: number) => `  ${'n'.repeat(length)}  `;

    expect(validateAgentInput({ ...valid, name: padded(80) }).value?.name).toBe('n'.repeat(80));
    expect(validateAgentUpdate({ name: padded(80) }).value).toEqual({ name: 'n'.repeat(80) });
    expect(validateAgentInput({ ...valid, name: padded(81) }).error).toMatch(/name is too long \(at most 80 characters\)/);
    expect(validateAgentUpdate({ name: padded(81) }).error).toMatch(/name is too long \(at most 80 characters\)/);
  });

  it.each([
    ['a missing name', { ...valid, name: undefined }, /name is required/],
    ['a name of spaces', { ...valid, name: '   ' }, /name is required/],
    ['a name that is not text', { ...valid, name: 7 }, /name is required/],
    ['a name that is too long', { ...valid, name: 'n'.repeat(81) }, /name is too long \(at most 80 characters\)/],
    ['a description that is too long', { ...valid, description: 'd'.repeat(301) }, /description must be text of at most 300 characters/],
    ['a description that is not text', { ...valid, description: ['x'] }, /description must be text/],
    ['missing instructions', { ...valid, instructions: undefined }, /instructions is required/],
    ['blank instructions', { ...valid, instructions: ' \n ' }, /instructions is required/],
    ['instructions that are too long', { ...valid, instructions: 'i'.repeat(4001) }, /instructions is too long \(at most 4,000 characters\)/],
    ['missing tools', { ...valid, tools: undefined }, /tools must be a list of tool ids/],
    ['tools that are not a list', { ...valid, tools: 'bash' }, /tools must be a list of tool ids/],
    ['an unknown tool', { ...valid, tools: ['read_file', 'teleport'] }, /Unknown tool "teleport"\. Choose from: write_file, read_file, bash, python, web_search, repo_scan/],
    ['a tool id in the wrong case', { ...valid, tools: ['Bash'] }, /Unknown tool "Bash"/],
    ['a tool that is not text', { ...valid, tools: [5] }, /Unknown tool an entry that is not text/],
    ['too many tools', { ...valid, tools: Array(51).fill('bash') }, /tools can have at most 50 entries/],
  ])('rejects %s', (_label, body, message) => {
    const result = validateAgentInput(body);

    expect(result.value).toBeUndefined();
    expect(result.error).toMatch(message);
  });

  it.each([[null], [undefined], ['agent'], [['a']], [42]])('rejects a body that is not an object (%j)', body => {
    expect(validateAgentInput(body).error).toBe('The request body must be an object');
    expect(validateAgentUpdate(body).error).toBe('The request body must be an object');
  });

  it('checks only the fields sent in a change, and returns only those', () => {
    expect(validateAgentUpdate({}).value).toEqual({});
    expect(validateAgentUpdate({ name: ' New name ' }).value).toEqual({ name: 'New name' });
    expect(validateAgentUpdate({ tools: ['bash', 'bash'] }).value).toEqual({ tools: ['bash'] });
    expect(validateAgentUpdate({ tools: [] }).value).toEqual({ tools: [] });
    expect(validateAgentUpdate({ description: '' }).value).toEqual({ description: '' });
    expect(validateAgentUpdate({ instructions: 'Do it.', name: 'x' }).value).toEqual({ instructions: 'Do it.', name: 'x' });
  });

  it('rejects a change that would break an agent', () => {
    expect(validateAgentUpdate({ name: '' }).error).toMatch(/name is required/);
    expect(validateAgentUpdate({ name: 'n'.repeat(81) }).error).toMatch(/name is too long/);
    expect(validateAgentUpdate({ instructions: '  ' }).error).toMatch(/instructions is required/);
    expect(validateAgentUpdate({ instructions: 'i'.repeat(4001) }).error).toMatch(/instructions is too long/);
    expect(validateAgentUpdate({ description: 'd'.repeat(301) }).error).toMatch(/description must be text/);
    expect(validateAgentUpdate({ tools: ['teleport'] }).error).toMatch(/Unknown tool/);
    expect(validateAgentUpdate({ tools: 'bash' }).error).toMatch(/tools must be a list/);
  });
});

describe('an automation that runs as an agent', () => {
  const base = { triggerType: 'manual', actionType: 'agent_task' };

  it('accepts an agent id', () => {
    expect(validateAutomationInput({ ...base, actionConfig: { prompt: 'Summarise', agentId: 'abc-123' } })).toBeNull();
    expect(validateAutomationInput({ ...base, actionConfig: { prompt: 'Summarise' } })).toBeNull();
  });

  it('rejects an agent id that is not text or is far too long', () => {
    expect(validateAutomationInput({ ...base, actionConfig: { agentId: 5 } })).toMatch(/agentId/);
    expect(validateAutomationInput({ ...base, actionConfig: { agentId: { id: 'x' } } })).toMatch(/agentId/);
    expect(validateAutomationInput({ ...base, actionConfig: { agentId: 'x'.repeat(201) } })).toMatch(/agentId/);
  });
});
