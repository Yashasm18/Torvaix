import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { executeBash, executeReadFile, executePython, executeWebSearch } from '../../../../../../packages/agent/src/agent-loop';

export async function POST(req: Request) {
  const { messages, model, provider, workspaceId } = await req.json();
  const apiKey = req.headers.get('x-api-key') || '';

  let aiModel;

  switch (provider) {
    case 'local':
    case 'ollama':
      // Ollama exposes an OpenAI-compatible API on port 11434
      const localOllama = createOpenAI({
        baseURL: 'http://localhost:11434/v1',
        apiKey: 'ollama', // API key is ignored by Ollama but required by the SDK
      });
      aiModel = localOllama(model || 'llama3.2');
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
      // Fallback to local Ollama if not specified
      const fallbackOllama = createOpenAI({
        baseURL: 'http://localhost:11434/v1',
        apiKey: 'ollama',
      });
      aiModel = fallbackOllama('llama3.2');
  }

  // Define tools available to the agent
  const agentTools = {
    bash: tool({
      description: 'Execute a bash command on the local machine. Use this to list files, install packages, or run shell scripts.',
      parameters: z.object({
        command: z.string().describe('The bash command to execute'),
      }),
      execute: async ({ command }) => {
        const result = await executeBash(command);
        return result;
      },
    }),
    read_file: tool({
      description: 'Read the contents of a file on the local machine.',
      parameters: z.object({
        filePath: z.string().describe('The absolute path to the file to read'),
      }),
      execute: async ({ filePath }) => {
        const result = await executeReadFile(filePath);
        return result;
      },
    }),
    python: tool({
      description: 'Execute Python code on the local machine.',
      parameters: z.object({
        code: z.string().describe('The python code to execute'),
      }),
      execute: async ({ code }) => {
        const result = await executePython(code);
        return result;
      },
    }),
    web_search: tool({
      description: 'Search the web for information using DuckDuckGo.',
      parameters: z.object({
        query: z.string().describe('The search query'),
      }),
      execute: async ({ query }) => {
        const result = await executeWebSearch(query);
        return result;
      },
    }),
  };



  const currentDate = new Date().toLocaleString();
  
  // Basic Workspace Context Engine
  let workspaceContext = `No specific workspace selected.`;
  if (workspaceId) {
    workspaceContext = `Active Workspace ID: ${workspaceId}
(Note: Document and memory retrieval for this workspace will be implemented in Phase 2).`;
  }

  const systemPrompt = `You are TORVAIX, an AI Operating System running locally on the user's machine.

[WORKSPACE CONTEXT ENGINE]
Current Date/Time: ${currentDate}
${workspaceContext}

You have access to local tools: bash, read_file, python, and web_search.
Before executing tools, briefly plan your steps. For example:
"1. List directory contents
2. Read the configuration file
3. Modify the code"
Then execute the necessary tools.
You are running within a local, privacy-first workspace. Ensure all actions are helpful and concise.`;

  const result = streamText({
    model: aiModel,
    messages,
    system: systemPrompt,
    tools: agentTools,
    maxSteps: 5, // Allow multi-step tool calls
  });

  return result.toDataStreamResponse();
}
