export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  description: string;
}

export const PROVIDERS = [
  { id: 'openai', name: 'OpenAI' },
  { id: 'anthropic', name: 'Anthropic' },
  { id: 'google', name: 'Google' },
  { id: 'deepseek', name: 'DeepSeek' },
  { id: 'ollama', name: 'Ollama (Local)' }
];

export const MODELS: ModelInfo[] = [
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', contextWindow: 128000, description: 'Most capable GPT model for complex tasks' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', contextWindow: 128000, description: 'Efficient GPT model for faster responses' },
  { id: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet', provider: 'anthropic', contextWindow: 200000, description: 'Excellent for creative writing and analysis' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'google', contextWindow: 2000000, description: 'Largest context window for long documents' },
  { id: 'deepseek-coder', name: 'DeepSeek Coder', provider: 'deepseek', contextWindow: 128000, description: 'Specialized for code generation and debugging' },
  { id: 'llama3.2', name: 'Llama 3.2', provider: 'ollama', contextWindow: 8192, description: 'Local model for privacy-first AI' },
  { id: 'mistral', name: 'Mistral', provider: 'ollama', contextWindow: 8192, description: 'Fast and efficient local model' }
];

export const getProviderById = (providerId: string) => PROVIDERS.find(p => p.id === providerId);

export const getModelsByProvider = (providerId: string) => MODELS.filter(m => m.provider === providerId);
