/**
 * Tests for the Provider Abstraction Layer
 *
 * Tests model metadata, LLMClient configuration, and provider readiness checks.
 * Actual API calls are mocked — these tests do not require network access.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LLMClient,
  MODELS,
  PROVIDERS,
  getModelById,
  getModelsByProvider,
  getProviderById,
} from '../index';

describe('Provider Metadata', () => {
  it('has providers defined', () => {
    expect(PROVIDERS.length).toBeGreaterThan(0);
    expect(PROVIDERS.some(p => p.id === 'ollama')).toBe(true);
    expect(PROVIDERS.some(p => p.id === 'openai')).toBe(true);
  });

  it('has models defined', () => {
    expect(MODELS.length).toBeGreaterThan(0);
    expect(MODELS.some(m => m.id === 'llama3.2')).toBe(true);
    expect(MODELS.some(m => m.id === 'gpt-4o')).toBe(true);
  });

  it('getModelById finds correct model', () => {
    expect(getModelById('llama3.2')?.provider).toBe('ollama');
    expect(getModelById('gpt-4o')?.provider).toBe('openai');
    expect(getModelById('nonexistent')).toBeUndefined();
  });

  it('getModelsByProvider filters correctly', () => {
    const ollamaModels = getModelsByProvider('ollama');
    expect(ollamaModels.every(m => m.provider === 'ollama')).toBe(true);
    expect(ollamaModels.length).toBeGreaterThan(0);
  });

  it('getProviderById finds correct provider', () => {
    expect(getProviderById('openai')?.name).toBe('OpenAI');
    expect(getProviderById('nonexistent')).toBeUndefined();
  });
});

describe('LLMClient Configuration', () => {
  it('uses default Ollama URL', () => {
    const client = new LLMClient();
    expect(client.getDefaultModel()).toBe('llama3.2');
  });

  it('respects custom default model', () => {
    const client = new LLMClient({ defaultModel: 'gpt-4o' });
    expect(client.getDefaultModel()).toBe('gpt-4o');
  });

  it('detects provider readiness with API keys', () => {
    const client = new LLMClient({
      apiKeys: { openai: 'sk-test', anthropic: 'sk-test' },
    });
    expect(client.isProviderReady('openai')).toBe(true);
    expect(client.isProviderReady('anthropic')).toBe(true);
    expect(client.isProviderReady('ollama')).toBe(true); // always ready
    expect(client.isProviderReady('groq')).toBe(false); // no key
  });

  it('throws on unknown model', async () => {
    const client = new LLMClient();
    await expect(
      client.complete('nonexistent-model', [{ role: 'user', content: 'hi' }])
    ).rejects.toThrow('Unknown model');
  });
});

describe('LLMClient with mocked fetch', () => {
  let client: LLMClient;

  beforeEach(() => {
    client = new LLMClient({
      apiKeys: { openai: 'sk-test', ollama: 'local' },
      defaultModel: 'gpt-4o-mini',
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls OpenAI API correctly', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Hello from OpenAI' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const res = await client.complete('gpt-4o-mini', [
      { role: 'user', content: 'Hello' },
    ]);

    expect(res.text).toBe('Hello from OpenAI');
    expect(res.usage?.totalTokens).toBe(15);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const call = mockFetch.mock.calls[0];
    expect(call[0]).toBe('https://api.openai.com/v1/chat/completions');
    expect(call[1].method).toBe('POST');
    expect(call[1].headers).toHaveProperty('Authorization', 'Bearer sk-test');
  });

  it('calls Ollama API correctly', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: { content: 'Hello from Ollama' },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const res = await client.complete('llama3.2', [
      { role: 'user', content: 'Hello' },
    ]);

    expect(res.text).toBe('Hello from Ollama');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const call = mockFetch.mock.calls[0];
    expect(call[0]).toBe('http://localhost:11434/api/chat');
  });

  it('handles API errors gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Invalid API key',
    }));

    await expect(
      client.complete('gpt-4o-mini', [{ role: 'user', content: 'hi' }])
    ).rejects.toThrow('OpenAI error 401');
  });

  it('applies temperature and maxTokens options', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'ok' } }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await client.complete('gpt-4o-mini', [{ role: 'user', content: 'hi' }], {
      temperature: 0.5,
      maxTokens: 100,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.temperature).toBe(0.5);
    expect(body.max_tokens).toBe(100);
  });
});
