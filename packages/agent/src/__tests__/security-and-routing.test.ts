import { describe, it, expect } from 'vitest';
import { checkBrowserRequest, hostnameOf, parseList, DEFAULT_ALLOWED_ORIGINS } from '../http-security';
import { isValidEmail, validateAutomationInput, validateWorkspaceId, validateMessages, validateText, clampCount, LIMITS } from '../validation';
import { keywordRoute } from '../routing';

const opts = { allowedOrigins: DEFAULT_ALLOWED_ORIGINS, allowedHosts: [] as string[] };

describe('checkBrowserRequest', () => {
  it('allows server-to-server calls (no Origin) on loopback hosts', () => {
    expect(checkBrowserRequest({ host: 'localhost:3001' }, opts).ok).toBe(true);
    expect(checkBrowserRequest({ host: '127.0.0.1:3001' }, opts).ok).toBe(true);
    expect(checkBrowserRequest({ host: '[::1]:3001' }, opts).ok).toBe(true);
    expect(checkBrowserRequest({}, opts).ok).toBe(true);
  });

  it('blocks other websites calling from the browser', () => {
    expect(checkBrowserRequest({ host: '127.0.0.1:3001', origin: 'https://evil.example' }, opts).ok).toBe(false);
    expect(checkBrowserRequest({ host: '127.0.0.1:3001', origin: 'null' }, opts).ok).toBe(false);
    expect(checkBrowserRequest({ host: '127.0.0.1:3001', origin: 'http://localhost:8080' }, opts).ok).toBe(false);
  });

  it('allows the Torvaix web app origin', () => {
    expect(checkBrowserRequest({ host: 'localhost:3001', origin: 'http://localhost:3000' }, opts).ok).toBe(true);
  });

  it('blocks DNS rebinding (non-loopback Host) unless explicitly allowed', () => {
    expect(checkBrowserRequest({ host: 'attacker.example:3001' }, opts).ok).toBe(false);
    expect(checkBrowserRequest({ host: 'torvaix:3001' }, { ...opts, allowedHosts: ['torvaix'] }).ok).toBe(true);
  });

  it('parses host headers and env lists', () => {
    expect(hostnameOf('LocalHost:3001')).toBe('localhost');
    expect(hostnameOf('[::1]:3001')).toBe('[::1]');
    expect(parseList(' a, b ,,', ['x'])).toEqual(['a', 'b']);
    expect(parseList('', ['x'])).toEqual(['x']);
  });
});

describe('isValidEmail', () => {
  it('accepts normal addresses and rejects malformed ones', () => {
    expect(isValidEmail('dev@torvaix.ai')).toBe(true);
    expect(isValidEmail('a.b+c@mail.example.co')).toBe(true);
    for (const bad of ['', 'no-at', '@x.com', 'a@b', 'a@b.', 'a@.com', 'a b@c.com', 'a@b@c.com', 42, null]) {
      expect(isValidEmail(bad)).toBe(false);
    }
  });

  it('stays fast on the input that made the old regex backtrack', () => {
    const crafted = '!@!.' + '!.'.repeat(50_000);
    const start = performance.now();
    isValidEmail(crafted);
    expect(performance.now() - start).toBeLessThan(50);
  });
});

describe('keywordRoute', () => {
  it('recalls instead of storing when the user asks what Torvaix remembers', () => {
    expect(keywordRoute('Do you remember my favorite framework?')).toBe('memory');
    expect(keywordRoute('What do you know about me?')).toBe('memory');
    expect(keywordRoute('what did I say about the deadline')).toBe('memory');
  });

  it('stores explicit facts', () => {
    expect(keywordRoute('Remember that my favorite framework is Next.js')).toBe('knowledge');
    expect(keywordRoute('Can you remember that I prefer tabs?')).toBe('knowledge');
    expect(keywordRoute('note to self: call the bank')).toBe('knowledge');
  });

  it('answers identity questions but not sentences that merely contain "your name"', () => {
    expect(keywordRoute("What's your name?")).toBe('identity');
    expect(keywordRoute('who are you')).toBe('identity');
    expect(keywordRoute('Should I put your name in the credits?')).toBeNull();
  });

  it('only scans the repo when asked about the repo', () => {
    expect(keywordRoute('Analyze this repo')).toBe('repo_analysis');
    expect(keywordRoute('show me the codebase architecture')).toBe('repo_analysis');
    expect(keywordRoute('Explain microservices architecture')).toBeNull();
  });

  it('sends clear tool requests to execution and leaves how-to questions to the classifier', () => {
    expect(keywordRoute('Create a hello.py file that prints hi')).toBe('execution');
    expect(keywordRoute('run the tests script')).toBe('execution');
    expect(keywordRoute('search the web for bun 2 release notes')).toBe('execution');
    expect(keywordRoute("what's the latest version of Node?")).toBe('execution');
    expect(keywordRoute('How do I create a React component?')).toBeNull();
    expect(keywordRoute('Explain how to write a for loop')).toBeNull();
    expect(keywordRoute('Help me brainstorm app names')).toBeNull();
  });
});

describe('validateAutomationInput', () => {
  const ok = { triggerType: 'schedule', triggerConfig: { frequency: 'daily' }, actionType: 'consolidate_memory' };

  it('accepts supported triggers and actions', () => {
    expect(validateAutomationInput(ok)).toBeNull();
    expect(validateAutomationInput({ triggerType: 'event', triggerConfig: { eventName: 'AGENT_FINISHED' }, actionType: 'agent_task' })).toBeNull();
    expect(validateAutomationInput({ triggerType: 'manual', actionType: 'synthesize_graph', status: 'paused' })).toBeNull();
  });

  it('rejects actions the engine cannot run, which used to report success without doing anything', () => {
    expect(validateAutomationInput({ ...ok, actionType: 'mcp_tool' })).toMatch(/actionType/);
    expect(validateAutomationInput({ ...ok, actionType: 'send_email' })).toMatch(/actionType/);
  });

  it('rejects events that are never emitted and unknown triggers', () => {
    expect(validateAutomationInput({ triggerType: 'event', triggerConfig: { eventName: 'FILE_CHANGED' }, actionType: 'agent_task' })).toMatch(/eventName/);
    expect(validateAutomationInput({ triggerType: 'event', actionType: 'agent_task' })).toMatch(/eventName/);
    expect(validateAutomationInput({ ...ok, triggerType: 'webhook' })).toMatch(/triggerType/);
    expect(validateAutomationInput({ ...ok, triggerConfig: { frequency: 'custom' } })).toMatch(/frequency/);
    expect(validateAutomationInput({ ...ok, status: 'running' })).toMatch(/status/);
  });
});

describe('request input validation', () => {
  it('accepts a missing workspaceId and plain strings, rejects everything else', () => {
    expect(validateWorkspaceId(undefined)).toBeNull();
    expect(validateWorkspaceId('default')).toBeNull();
    for (const bad of ['', 'x'.repeat(201), ['a', 'b'], { a: 1 }, 5, null, 'a\nb']) {
      expect(validateWorkspaceId(bad)).toMatch(/workspaceId/);
    }
  });

  it('accepts well-formed chat history and rejects the shapes that used to crash the agent', () => {
    expect(validateMessages(undefined)).toBeNull();
    expect(validateMessages([])).toBeNull();
    expect(validateMessages([{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }])).toBeNull();
    expect(validateMessages('oops')).toMatch(/array/);
    expect(validateMessages([null])).toMatch(/object/);
    expect(validateMessages([5])).toMatch(/object/);
    expect(validateMessages([{ role: 'user' }])).toMatch(/content/);
    expect(validateMessages([{ role: 'admin', content: 'x' }])).toMatch(/role/);
    expect(validateMessages(Array.from({ length: LIMITS.messages + 1 }, () => ({ role: 'user', content: 'x' })))).toMatch(/at most/);
  });

  it('limits text and clamps counts', () => {
    expect(validateText('hello', 'content', 10)).toBeNull();
    expect(validateText('   ', 'content', 10)).toMatch(/required/);
    expect(validateText(5, 'content', 10)).toMatch(/required/);
    expect(validateText('x'.repeat(11), 'content', 10)).toMatch(/too long/);
    expect(clampCount(3, 5, 50)).toBe(3);
    expect(clampCount(1e9, 5, 50)).toBe(50);
    expect(clampCount(-5, 5, 50)).toBe(1);
    expect(clampCount('7', 5, 50)).toBe(7);
    expect(clampCount('abc', 5, 50)).toBe(5);
    expect(clampCount(undefined, 5, 50)).toBe(5);
    expect(clampCount(2.9, 5, 50)).toBe(2);
  });
});
