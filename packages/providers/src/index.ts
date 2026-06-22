/**
 * Torvaix Provider Abstraction Layer
 *
 * Unified LLM client with adapters for multiple providers:
 * - Ollama (local)
 * - OpenAI
 * - Anthropic
 * - Google (Gemini)
 * - Groq
 * - OpenRouter
 *
 * Usage:
 *   const client = new LLMClient({ apiKeys: { openai: 'sk-...' } });
 *   const { text, usage } = await client.complete('gpt-4o', messages, { temperature: 0.7 });
 */

export type ProviderId = 'ollama' | 'openai' | 'anthropic' | 'google' | 'groq' | 'openrouter';

export interface ModelInfo {
  id: string;
  name: string;
  provider: ProviderId;
  contextWindow: number;
  description: string;
}

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMResponse {
  text: string;
  usage?: LLMUsage;
  model: string;
}

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
  system?: string;
  topP?: number;
}

export const PROVIDERS = [
  { id: 'openai' as ProviderId, name: 'OpenAI' },
  { id: 'anthropic' as ProviderId, name: 'Anthropic' },
  { id: 'google' as ProviderId, name: 'Google' },
  { id: 'groq' as ProviderId, name: 'Groq' },
  { id: 'openrouter' as ProviderId, name: 'OpenRouter' },
  { id: 'ollama' as ProviderId, name: 'Ollama (Local)' },
];

export const MODELS: ModelInfo[] = [
  // OpenAI
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', contextWindow: 128000, description: 'Most capable GPT model for complex tasks' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', contextWindow: 128000, description: 'Fast, affordable, very capable' },
  { id: 'o3-mini', name: 'o3 Mini', provider: 'openai', contextWindow: 200000, description: 'Reasoning-optimized' },
  // Anthropic
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic', contextWindow: 200000, description: 'Best for coding and analysis' },
  { id: 'claude-haiku-4-20250514', name: 'Claude Haiku 4', provider: 'anthropic', contextWindow: 200000, description: 'Fast, efficient' },
  // Google
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'google', contextWindow: 2000000, description: 'Largest context window' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'google', contextWindow: 1000000, description: 'Fast with huge context' },
  // Groq
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', provider: 'groq', contextWindow: 128000, description: 'Fast inference via Groq' },
  { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', provider: 'groq', contextWindow: 32768, description: 'Efficient MoE via Groq' },
  // OpenRouter
  { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet (OR)', provider: 'openrouter', contextWindow: 200000, description: 'Claude via OpenRouter' },
  { id: 'openai/gpt-4o', name: 'GPT-4o (OR)', provider: 'openrouter', contextWindow: 128000, description: 'GPT-4o via OpenRouter' },
  // Ollama (local)
  { id: 'llama3.2', name: 'Llama 3.2', provider: 'ollama', contextWindow: 128000, description: 'Local privacy-first model' },
  { id: 'mistral', name: 'Mistral', provider: 'ollama', contextWindow: 32000, description: 'Fast efficient local model' },
  { id: 'deepseek-coder-v2', name: 'DeepSeek Coder V2', provider: 'ollama', contextWindow: 128000, description: 'Local coding specialist' },
  { id: 'nomic-embed-text', name: 'Nomic Embed Text', provider: 'ollama', contextWindow: 8192, description: 'Local embeddings (not for chat)' },
];

export const getProviderById = (providerId: string) => PROVIDERS.find(p => p.id === providerId);
export const getModelsByProvider = (providerId: string) => MODELS.filter(m => m.provider === providerId);
export const getModelById = (modelId: string) => MODELS.find(m => m.id === modelId);

// ── Provider Configuration ──
export interface LLMClientConfig {
  apiKeys?: Partial<Record<ProviderId, string>>;
  ollamaUrl?: string;
  defaultModel?: string;
  timeoutMs?: number;
}

// ── Unified LLM Client ──
export class LLMClient {
  private apiKeys: Partial<Record<ProviderId, string>>;
  private ollamaUrl: string;
  private defaultModel: string;
  private timeoutMs: number;

  constructor(config: LLMClientConfig = {}) {
    this.apiKeys = {
      openai: config.apiKeys?.openai ?? process.env.OPENAI_API_KEY ?? '',
      anthropic: config.apiKeys?.anthropic ?? process.env.ANTHROPIC_API_KEY ?? '',
      google: config.apiKeys?.google ?? process.env.GOOGLE_API_KEY ?? '',
      groq: config.apiKeys?.groq ?? process.env.GROQ_API_KEY ?? '',
      openrouter: config.apiKeys?.openrouter ?? process.env.OPENROUTER_API_KEY ?? '',
      ollama: 'local', // no key needed
    };
    this.ollamaUrl = config.ollamaUrl ?? process.env.OLLAMA_URL ?? 'http://localhost:11434';
    this.defaultModel = config.defaultModel ?? process.env.TORVAIX_MODEL ?? 'llama3.2';
    this.timeoutMs = config.timeoutMs ?? 120000;
  }

  /** Complete a chat conversation with the specified model. */
  async complete(modelId: string, messages: LLMMessage[], opts: LLMOptions = {}): Promise<LLMResponse> {
    const model = getModelById(modelId) ?? getModelById(this.defaultModel);
    if (!model) throw new Error(`Unknown model: ${modelId}`);

    const provider = model.provider;

    switch (provider) {
      case 'openai': return this._callOpenAI(model.id, messages, opts);
      case 'anthropic': return this._callAnthropic(model.id, messages, opts);
      case 'google': return this._callGoogle(model.id, messages, opts);
      case 'groq': return this._callGroq(model.id, messages, opts);
      case 'openrouter': return this._callOpenRouter(model.id, messages, opts);
      case 'ollama': return this._callOllama(model.id, messages, opts);
      default: throw new Error(`Provider "${provider}" not implemented`);
    }
  }

  /** Shorthand: complete with default model. */
  async chat(messages: LLMMessage[], opts?: LLMOptions): Promise<LLMResponse> {
    return this.complete(this.defaultModel, messages, opts);
  }

  /** Check if a provider is configured (has API key or is local). */
  isProviderReady(providerId: ProviderId): boolean {
    if (providerId === 'ollama') return true;
    return !!this.apiKeys[providerId];
  }

  /** Get the default model ID. */
  getDefaultModel(): string {
    return this.defaultModel;
  }

  // ── Private: Provider Adapters ──

  private async _callOpenAI(model: string, messages: LLMMessage[], opts: LLMOptions): Promise<LLMResponse> {
    const key = this.apiKeys.openai;
    if (!key) throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY env var.');

    const body = {
      model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 4096,
      top_p: opts.topP ?? 1,
    };

    const res = await this._fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return {
      text: data.choices?.[0]?.message?.content ?? '',
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
      model,
    };
  }

  private async _callAnthropic(model: string, messages: LLMMessage[], opts: LLMOptions): Promise<LLMResponse> {
    const key = this.apiKeys.anthropic;
    if (!key) throw new Error('Anthropic API key not configured. Set ANTHROPIC_API_KEY env var.');

    const systemMsg = messages.find(m => m.role === 'system');
    const apiMessages = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const body: any = {
      model,
      max_tokens: opts.maxTokens ?? 4096,
      messages: apiMessages,
      temperature: opts.temperature ?? 0.7,
    };
    if (systemMsg) body.system = systemMsg.content;

    const res = await this._fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return {
      text: data.content?.[0]?.text ?? '',
      usage: data.usage ? {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: data.usage.input_tokens + data.usage.output_tokens,
      } : undefined,
      model,
    };
  }

  private async _callGoogle(model: string, messages: LLMMessage[], opts: LLMOptions): Promise<LLMResponse> {
    const key = this.apiKeys.google;
    if (!key) throw new Error('Google API key not configured. Set GOOGLE_API_KEY env var.');

    const systemMsg = messages.find(m => m.role === 'system');
    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const body: any = { contents };
    if (systemMsg) body.systemInstruction = { parts: [{ text: systemMsg.content }] };
    body.generationConfig = {
      temperature: opts.temperature ?? 0.7,
      maxOutputTokens: opts.maxTokens ?? 4096,
      topP: opts.topP ?? 1,
    };

    const res = await this._fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) throw new Error(`Google error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const usage = data.usageMetadata;
    return {
      text,
      usage: usage ? {
        promptTokens: usage.promptTokenCount ?? 0,
        completionTokens: usage.candidatesTokenCount ?? 0,
        totalTokens: usage.totalTokenCount ?? 0,
      } : undefined,
      model,
    };
  }

  private async _callGroq(model: string, messages: LLMMessage[], opts: LLMOptions): Promise<LLMResponse> {
    const key = this.apiKeys.groq;
    if (!key) throw new Error('Groq API key not configured. Set GROQ_API_KEY env var.');

    const res = await this._fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 4096,
        top_p: opts.topP ?? 1,
      }),
    });

    if (!res.ok) throw new Error(`Groq error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return {
      text: data.choices?.[0]?.message?.content ?? '',
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
      model,
    };
  }

  private async _callOpenRouter(model: string, messages: LLMMessage[], opts: LLMOptions): Promise<LLMResponse> {
    const key = this.apiKeys.openrouter;
    if (!key) throw new Error('OpenRouter API key not configured. Set OPENROUTER_API_KEY env var.');

    const res = await this._fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.OPENROUTER_REFERER ?? 'https://torvaix.local',
        'X-Title': 'Torvaix',
      },
      body: JSON.stringify({
        model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 4096,
        top_p: opts.topP ?? 1,
      }),
    });

    if (!res.ok) throw new Error(`OpenRouter error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return {
      text: data.choices?.[0]?.message?.content ?? '',
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
      model,
    };
  }

  private async _callOllama(model: string, messages: LLMMessage[], opts: LLMOptions): Promise<LLMResponse> {
    // Ollama uses /api/chat (not /api/generate) for chat-style conversations
    const res = await this._fetchWithTimeout(`${this.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: false,
        options: {
          temperature: opts.temperature ?? 0.7,
          num_predict: opts.maxTokens ?? 4096,
          top_p: opts.topP ?? 1,
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama error ${res.status}: ${text}. Is Ollama running at ${this.ollamaUrl}?`);
    }
    const data = await res.json();
    return {
      text: data.message?.content ?? data.response ?? '',
      model,
    };
  }

  private async _fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      return res;
    } finally {
      clearTimeout(timeout);
    }
  }
}
