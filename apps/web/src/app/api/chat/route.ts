import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText } from 'ai';

// In a real implementation, keys should be fetched from headers or securely
// from the client request since V1 uses local storage.
// For this scaffolding, we'll assume they are passed in headers.
export async function POST(req: Request) {
  const { messages, model, provider } = await req.json();
  const apiKey = req.headers.get('x-api-key') || '';

  let aiModel;

  switch (provider) {
    case 'local':
      // Ollama exposes an OpenAI-compatible API on port 11434
      const localOllama = createOpenAI({
        baseURL: 'http://localhost:11434/v1',
        apiKey: 'ollama', // API key is ignored by Ollama but required by the SDK
      });
      aiModel = localOllama(model);
      break;
    case 'openai':
      const openai = createOpenAI({ apiKey });
      aiModel = openai(model);
      break;
    case 'anthropic':
      const anthropic = createAnthropic({ apiKey });
      aiModel = anthropic(model);
      break;
    case 'google':
      const google = createGoogleGenerativeAI({ apiKey });
      aiModel = google(model);
      break;
    default:
      return new Response('Provider not supported yet', { status: 400 });
  }

  const result = await streamText({
    model: aiModel,
    messages,
  });

  return result.toTextStreamResponse();
}
