import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SettingsStore, keyHint, validateApiKey, validateModelId } from '../settings';

describe('SettingsStore', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'torvaix-settings-'));
    file = path.join(dir, 'data', 'settings.json');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('starts empty when there is no file', () => {
    const store = new SettingsStore(file);
    expect(store.getApiKey('openai')).toBeUndefined();
    expect(store.getModel()).toBeUndefined();
  });

  it('keeps keys and the chosen model across restarts, in a file only the user can read', () => {
    const store = new SettingsStore(file);
    store.setApiKey('anthropic', '  test-key-not-real-1234  ');
    store.setModel({ provider: 'anthropic', id: 'claude-sonnet-5-5' });

    const reopened = new SettingsStore(file);
    expect(reopened.getApiKey('anthropic')).toBe('test-key-not-real-1234');
    expect(reopened.getModel()).toEqual({ provider: 'anthropic', id: 'claude-sonnet-5-5' });
    if (process.platform !== 'win32') expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(fs.readdirSync(path.dirname(file))).toEqual(['settings.json']); // no temporary file left behind
  });

  it('forgets a removed key and a cleared model', () => {
    const store = new SettingsStore(file);
    store.setApiKey('openai', 'test-key-not-real-1234');
    store.setModel({ provider: 'openai', id: 'gpt-4o' });
    store.removeApiKey('openai');
    store.setModel(undefined);

    const reopened = new SettingsStore(file);
    expect(reopened.getApiKey('openai')).toBeUndefined();
    expect(reopened.getModel()).toBeUndefined();
  });

  it('ignores a damaged file and unknown or malformed entries', () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{ not json');
    expect(new SettingsStore(file).getModel()).toBeUndefined();

    fs.writeFileSync(file, JSON.stringify({
      apiKeys: { openai: 'test-key-not-real-1234', madeup: 'test-key-not-real-1234', groq: 5, ollama: 'test-key-not-real-1234' },
      model: { provider: 'madeup', id: 'x' },
    }));
    const store = new SettingsStore(file);
    expect(store.getApiKey('openai')).toBe('test-key-not-real-1234');
    expect(store.getApiKey('groq')).toBeUndefined();
    expect(store.getApiKey('ollama')).toBeUndefined();
    expect(store.getModel()).toBeUndefined();
  });
});

describe('settings validation', () => {
  it('accepts plausible API keys and rejects the rest', () => {
    expect(validateApiKey('test-key-not-real-1234')).toBeNull();
    expect(validateApiKey('  test-key-not-real-1234\n')).toBeNull(); // pasted with stray whitespace around it
    expect(validateApiKey('short')).toMatch(/too short/);
    expect(validateApiKey('x'.repeat(501))).toMatch(/too long/);
    expect(validateApiKey('two words here')).toMatch(/spaces/);
    expect(validateApiKey(undefined)).toMatch(/text/);
    expect(validateApiKey({ key: 'x' })).toMatch(/text/);
  });

  it('accepts model ids from any provider and rejects empty or spaced ones', () => {
    for (const id of ['llama3.2:3b', 'claude-sonnet-5-5', 'anthropic/claude-sonnet-4', 'gpt-4o-mini']) {
      expect(validateModelId(id)).toBeNull();
    }
    expect(validateModelId('')).toMatch(/required/);
    expect(validateModelId('two words')).toMatch(/spaces/);
    expect(validateModelId('x'.repeat(201))).toMatch(/too long/);
    expect(validateModelId(7)).toMatch(/required/);
  });

  it('shows only the end of a key, and nothing of a short one', () => {
    expect(keyHint('test-key-not-real-1234')).toBe('…1234');
    expect(keyHint('shortkey')).toBe('…');
  });
});
