import { describe, it, expect } from 'vitest';
import { checkBrowserRequest, hostnameOf, parseList, DEFAULT_ALLOWED_ORIGINS } from '../http-security';
import { isValidEmail } from '../validation';
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
