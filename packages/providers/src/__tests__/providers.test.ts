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
  resolveModel,
  pickInstalledModel,
  matchInstalledTag,
  readOllamaStream,
  stripThinking,
  thinkingFilter,
  ollamaContextSize,
  DEFAULT_OLLAMA_CONTEXT,
  describeHttpError,
  isProviderId,
  isOpenAIReasoningModel,
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

  it('matchInstalledTag uses another tag of the chosen model, and never a different model', () => {
    expect(matchInstalledTag('llama3.2', ['qwen3-vl:4b', 'llama3.2:3b'])).toBe('llama3.2:3b');
    expect(matchInstalledTag('llama3.2', ['llama3.2:latest', 'llama3.2:3b'])).toBe('llama3.2');
    expect(matchInstalledTag('llama3.2:1b', ['llama3.2:1b', 'llama3.2:3b'])).toBe('llama3.2:1b');
    expect(matchInstalledTag('mistral', ['qwen3-vl:4b'])).toBe('mistral');
    expect(matchInstalledTag('mistral', [])).toBe('mistral');
  });

  it('pickInstalledModel prefers the configured model, then a same-model tag, then any chat model', () => {
    expect(pickInstalledModel('llama3.2', ['llama3.2:latest', 'qwen2.5:3b'])).toBe('llama3.2');
    expect(pickInstalledModel('llama3.2', ['qwen2.5:3b', 'llama3.2:3b'])).toBe('llama3.2:3b');
    expect(pickInstalledModel('llama3.2', ['nomic-embed-text:latest', 'qwen2.5:3b'])).toBe('qwen2.5:3b');
    expect(pickInstalledModel('llama3.2', ['nomic-embed-text:latest'])).toBe('llama3.2');
    expect(pickInstalledModel('llama3.2', [])).toBe('llama3.2');
  });

  it('resolveModel keeps registry metadata and treats unknown ids as Ollama tags', () => {
    expect(resolveModel('gpt-4o').provider).toBe('openai');
    expect(resolveModel('llama3.2:3b')).toMatchObject({ id: 'llama3.2:3b', provider: 'ollama' });
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
    client.complete('gpt-4o-mini', [
      { role: 'user', content: 'Hello' }
    ])
  ).rejects.toThrow();
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

  it('routes unregistered model ids to Ollama as tags', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: 'Hi from a pulled tag' } }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const res = await client.complete('llama3.2:3b', [{ role: 'user', content: 'Hello' }]);

    expect(res.text).toBe('Hi from a pulled tag');
    expect(res.model).toBe('llama3.2:3b');
    expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:11434/api/chat');
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).model).toBe('llama3.2:3b');
  });

  it('handles API errors gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Invalid API key',
    }));

    await expect(
      client.complete('gpt-4o-mini', [{ role: 'user', content: 'hi' }])
    ).rejects.toThrow('OpenAI rejected the API key (HTTP 401). Check it in Settings → Models & keys.');
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

  it('explains how to fix an unreachable Ollama instead of "fetch failed"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(client.complete('llama3.2:3b', [{ role: 'user', content: 'hi' }])).rejects.toThrow(
      'Couldn\'t reach Ollama at http://localhost:11434. Is it running? Start it with: ollama serve'
    );
  });

  it('names the command to install a missing Ollama model', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => '{"error":"model \'llama3.2\' not found"}',
    }));
    await expect(client.complete('llama3.2', [{ role: 'user', content: 'hi' }])).rejects.toThrow(
      'The model "llama3.2" isn\'t installed in Ollama. Install it with: ollama pull llama3.2'
    );
  });

  it('passes a user cancellation through unchanged', async () => {
    const cancel = new AbortController();
    cancel.abort();
    const abortError = new DOMException('This operation was aborted', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));
    await expect(
      client.complete('llama3.2:3b', [{ role: 'user', content: 'hi' }], { signal: cancel.signal })
    ).rejects.toBe(abortError);
  });
});

describe('models and keys chosen in the app', () => {
  afterEach(() => vi.unstubAllGlobals());

  const okResponse = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });

  it('sends a model outside the built-in list to the provider the user picked, not to Ollama', async () => {
    expect(resolveModel('claude-next-9', 'anthropic')).toMatchObject({ id: 'claude-next-9', provider: 'anthropic' });
    expect(resolveModel('gpt-4o', 'openrouter').provider).toBe('openrouter');
    expect(resolveModel('some-local-model').provider).toBe('ollama');

    const mockFetch = vi.fn().mockResolvedValue(okResponse({ content: [{ text: 'hi' }] }));
    vi.stubGlobal('fetch', mockFetch);
    const client = new LLMClient({ apiKeys: { anthropic: 'test-key-not-real' } });
    await client.complete('claude-next-9', [{ role: 'user', content: 'hi' }], { provider: 'anthropic' });

    expect(mockFetch.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages');
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).model).toBe('claude-next-9');
  });

  it('uses a key added while running, and stops when it is removed', async () => {
    const client = new LLMClient({ apiKeys: { openai: '' } });
    expect(client.isProviderReady('openai')).toBe(false);

    client.setApiKey('openai', '  test-key-not-real  ');
    expect(client.isProviderReady('openai')).toBe(true);
    const mockFetch = vi.fn().mockResolvedValue(okResponse({ choices: [{ message: { content: 'hi' } }] }));
    vi.stubGlobal('fetch', mockFetch);
    await client.complete('gpt-4o-mini', [{ role: 'user', content: 'hi' }]);
    expect(mockFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer test-key-not-real');

    client.setApiKey('openai', undefined);
    expect(client.isProviderReady('openai')).toBe(false);
    await expect(client.complete('gpt-4o-mini', [{ role: 'user', content: 'hi' }])).rejects.toThrow(/Settings → Models & keys/);
  });

  it('keeps the Google key out of the request URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue(okResponse({ candidates: [{ content: { parts: [{ text: 'hi' }] } }] }));
    vi.stubGlobal('fetch', mockFetch);
    const client = new LLMClient({ apiKeys: { google: 'test-key-not-real' } });
    await client.complete('gemini-2.5-flash', [{ role: 'user', content: 'hi' }]);

    expect(mockFetch.mock.calls[0][0]).not.toContain('test-key-not-real');
    expect(mockFetch.mock.calls[0][1].headers['x-goog-api-key']).toBe('test-key-not-real');
  });

  it('explains provider errors instead of showing their JSON', () => {
    const body = '{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}';
    expect(describeHttpError('Anthropic', 401, body)).toBe('Anthropic rejected the API key (HTTP 401). Check it in Settings → Models & keys.');
    expect(describeHttpError('OpenAI', 404, '{"error":{"message":"The model `gpt-9` does not exist"}}')).toContain('Check the model id. The model `gpt-9` does not exist');
    expect(describeHttpError('Groq', 429, 'slow down')).toMatch(/rate limiting.*slow down/);
    expect(describeHttpError('Google', 500, 'boom')).toBe('Google error 500: boom');
  });

  it('recognises provider ids', () => {
    expect(isProviderId('anthropic')).toBe(true);
    expect(isProviderId('nope')).toBe(false);
    expect(isProviderId(undefined)).toBe(false);
  });
});

describe('OpenAI reasoning models', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('are recognised by id', () => {
    for (const id of ['o3-mini', 'o1', 'o4-mini', 'gpt-5', 'gpt-5-mini']) expect(isOpenAIReasoningModel(id)).toBe(true);
    for (const id of ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1']) expect(isOpenAIReasoningModel(id)).toBe(false);
  });

  it('are sent max_completion_tokens and no sampling settings, which they reject', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) });
    vi.stubGlobal('fetch', mockFetch);
    const client = new LLMClient({ apiKeys: { openai: 'test-key-not-real' } });

    await client.complete('o3-mini', [{ role: 'user', content: 'hi' }], { temperature: 0.2, maxTokens: 50 });
    const reasoning = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(reasoning).toMatchObject({ model: 'o3-mini', max_completion_tokens: 50 });
    expect(reasoning).not.toHaveProperty('max_tokens');
    expect(reasoning).not.toHaveProperty('temperature');
    expect(reasoning).not.toHaveProperty('top_p');

    await client.complete('gpt-4o-mini', [{ role: 'user', content: 'hi' }], { temperature: 0.2, maxTokens: 50 });
    const ordinary = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(ordinary).toMatchObject({ max_tokens: 50, temperature: 0.2 });
    expect(ordinary).not.toHaveProperty('max_completion_tokens');
  });
});

describe('readOllamaStream', () => {
  const streamOf = (...chunks: string[]) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
        controller.close();
      },
    });
  const line = (content: string) => JSON.stringify({ message: { content } }) + '\n';

  it('passes on each piece and returns the whole text, even when a line is split across chunks', async () => {
    const pieces: string[] = [];
    const whole = line('Hello') + line(', wör') + line('ld');
    const text = await readOllamaStream(streamOf(whole.slice(0, 20), whole.slice(20, 41), whole.slice(41), '{"done":true}'), p => pieces.push(p));
    expect(text).toBe('Hello, wörld');
    expect(pieces).toEqual(['Hello', ', wör', 'ld']);
  });

  it('throws an error the stream reports', async () => {
    await expect(readOllamaStream(streamOf(line('Hi'), '{"error":"out of memory"}\n'), () => {})).rejects.toThrow('Ollama error: out of memory');
  });

  it("leaves out a thinking model's reasoning, even when its tags arrive in pieces", async () => {
    const pieces: string[] = [];
    const text = await readOllamaStream(
      streamOf(line('<thi'), line('nk>Let me see. 2+2'), line(' is 4.</th'), line('ink>\n\nIt is '), line('4.')),
      p => pieces.push(p)
    );
    expect(text).toBe('It is 4.');
    expect(pieces.join('')).toBe('It is 4.');
  });
});

describe('thinking models', () => {
  it('removes reasoning before the answer, and nothing else', () => {
    expect(stripThinking('<think>\nhmm\n</think>\n\nexecution')).toBe('execution');
    expect(stripThinking('  <think>a</think>{"done": true}')).toBe('{"done": true}');
    expect(stripThinking('An answer that mentions <think> tags')).toBe('An answer that mentions <think> tags');
    expect(stripThinking('<think>never finished')).toBe('');
  });

  it('streams an ordinary reply unchanged, including one starting with "<"', () => {
    const plain = thinkingFilter();
    expect(['Hel', 'lo'].map(p => plain.push(p)).join('')).toBe('Hello');
    const tag = thinkingFilter();
    expect(['<', 'div> is an element'].map(p => tag.push(p)).join('')).toBe('<div> is an element');
  });
});

describe('Ollama requests', () => {
  const okFetch = (body: object = { message: { content: 'hi' } }) =>
    vi.fn().mockResolvedValue({ ok: true, json: async () => body });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('asks for a context window big enough for Torvaix prompts, the same every time', async () => {
    const mockFetch = okFetch();
    vi.stubGlobal('fetch', mockFetch);
    await new LLMClient().complete('llama3.2', [{ role: 'user', content: 'hi' }]);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).options.num_ctx).toBe(DEFAULT_OLLAMA_CONTEXT);
  });

  it('follows TORVAIX_NUM_CTX, and leaves the size to Ollama when it is 0', async () => {
    expect(ollamaContextSize('16384')).toBe(16384);
    expect(ollamaContextSize('0')).toBe(0);
    expect(ollamaContextSize('lots')).toBe(DEFAULT_OLLAMA_CONTEXT);
    const mockFetch = okFetch();
    vi.stubGlobal('fetch', mockFetch);
    await new LLMClient({ ollamaContext: 0 }).complete('llama3.2', [{ role: 'user', content: 'hi' }]);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).options).not.toHaveProperty('num_ctx');
  });

  it('asks for JSON only when the caller needs it', async () => {
    const mockFetch = okFetch();
    vi.stubGlobal('fetch', mockFetch);
    const client = new LLMClient();
    await client.complete('llama3.2', [{ role: 'user', content: 'hi' }], { json: true });
    await client.complete('llama3.2', [{ role: 'user', content: 'hi' }]);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body).format).toBe('json');
    expect(JSON.parse(mockFetch.mock.calls[1][1].body)).not.toHaveProperty('format');
  });

  it('reports the tokens Ollama counted', async () => {
    vi.stubGlobal('fetch', okFetch({ message: { content: 'hi' }, prompt_eval_count: 1200, eval_count: 30 }));
    const res = await new LLMClient().complete('llama3.2', [{ role: 'user', content: 'hi' }]);
    expect(res.usage).toEqual({ promptTokens: 1200, completionTokens: 30, totalTokens: 1230 });
  });

  it('waits longer for a local model than for a cloud one, and follows TORVAIX_MODEL_TIMEOUT', async () => {
    vi.useFakeTimers();
    try {
      const hang = (_url: string, init: RequestInit) =>
        new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(new Error('aborted'))));
      vi.stubGlobal('fetch', vi.fn(hang));
      const local = new LLMClient().complete('llama3.2', [{ role: 'user', content: 'hi' }]);
      const localDone = expect(local).rejects.toThrow('within 300 seconds');
      await vi.advanceTimersByTimeAsync(300_000);
      await localDone;

      vi.stubEnv('TORVAIX_MODEL_TIMEOUT', '30');
      const custom = new LLMClient().complete('llama3.2', [{ role: 'user', content: 'hi' }]);
      const customDone = expect(custom).rejects.toThrow('within 30 seconds');
      await vi.advanceTimersByTimeAsync(30_000);
      await customDone;
    } finally {
      vi.useRealTimers();
    }
  });
});
