export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
}

export const PROVIDERS = [
  { id: 'openai', name: 'OpenAI' },
  { id: 'anthropic', name: 'Anthropic' },
  { id: 'google', name: 'Google' },
  { id: 'deepseek', name: 'DeepSeek' },
  { id: 'ollama', name: 'Ollama (Local)' }
];

export const MODELS: ModelInfo[] = [
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', contextWindow: 128000 },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', contextWindow: 128000 },
  { id: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet', provider: 'anthropic', contextWindow: 200000 },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'google', contextWindow: 2000000 },
  { id: 'deepseek-coder', name: 'DeepSeek Coder', provider: 'deepseek', contextWindow: 128000 }
];
