import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText, tool, type ModelMessage } from 'ai';
import { z } from 'zod';
import {
  executeBash,
  executeFindEntitiesByType,
  executeFindPath,
  executeGetNeighbors,
  executePython,
  executeQueryGraph,
  executeQueryMemoryRecords,
  executeReadFile,
  executeWebSearch,
} from '../../../../../../packages/agent/src/agent-loop';

type ChatRequestBody = {
  messages: ModelMessage[];
  model?: string;
  provider?: string;
  workspaceId?: string;
};

function getMessageText(message: ModelMessage | undefined): string {
  if (!message || !('content' in message)) return '';
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => ('text' in part && typeof part.text === 'string' ? part.text : ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

export async function POST(req: Request) {
  const { messages, model, provider, workspaceId } = await req.json() as ChatRequestBody;
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
      aiModel = openai((model || 'gpt-4o-mini') as never);
      break;
    case 'anthropic':
      const anthropic = createAnthropic({ apiKey });
      aiModel = anthropic((model || 'claude-3-5-sonnet-latest') as never);
      break;
    case 'google':
      const google = createGoogleGenerativeAI({ apiKey });
      aiModel = google((model || 'gemini-1.5-flash') as never);
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
      // @ts-expect-error AI SDK tool execute types are narrower than these local tool adapters.
      execute: async ({ command }: { command: string }) => {
        const result = await executeBash(command);
        return result;
      },
    }),
    read_file: tool({
      description: 'Read the contents of a file on the local machine.',
      parameters: z.object({
        filePath: z.string().describe('The absolute path to the file to read'),
      }),
      // @ts-expect-error AI SDK tool execute types are narrower than these local tool adapters.
      execute: async ({ filePath }: { filePath: string }) => {
        const result = await executeReadFile(filePath);
        return result;
      },
    }),
    python: tool({
      description: 'Execute Python code on the local machine.',
      parameters: z.object({
        code: z.string().describe('The python code to execute'),
      }),
      // @ts-expect-error AI SDK tool execute types are narrower than these local tool adapters.
      execute: async ({ code }: { code: string }) => {
        const result = await executePython(code);
        return result;
      },
    }),
    web_search: tool({
      description: 'Search the web for information using DuckDuckGo.',
      parameters: z.object({
        query: z.string().describe('The search query'),
      }),
      // @ts-expect-error AI SDK tool execute types are narrower than these local tool adapters.
      execute: async ({ query }: { query: string }) => {
        const result = await executeWebSearch(query);
        return result;
      },
    }),
    store_memory: tool({
      description: 'Store an important fact, detail, or summary about the user, project, or context into long-term persistent memory.',
      parameters: z.object({
        content: z.string().describe('The fact or detail to store'),
        source: z.string().describe('The source of this memory (e.g. "User Message", "Project Documentation")')
      }),
      // @ts-expect-error AI SDK tool execute types are narrower than these local tool adapters.
      execute: async ({ content, source }: { content: string, source: string }) => {
        const { executeStoreMemory } = await import('../../../../../../packages/agent/src/agent-loop');
        const result = await executeStoreMemory(workspaceId || 'default', content, source);
        return result;
      },
    }),
    query_memory: tool({
      description: 'Query long-term persistent memory for facts, details, or context previously stored.',
      parameters: z.object({
        query: z.string().describe('The search query to retrieve memories'),
        topK: z.number().optional().describe('Number of results to return (default 5)')
      }),
      // @ts-expect-error AI SDK tool execute types are narrower than these local tool adapters.
      execute: async ({ query, topK }: { query: string, topK?: number }) => {
        const { executeQueryMemory } = await import('../../../../../../packages/agent/src/agent-loop');
        const result = await executeQueryMemory(workspaceId || 'default', query, topK);
        return result;
      },
    }),
    update_memory: tool({
      description: 'Update the content of an existing memory by its ID.',
      parameters: z.object({
        id: z.string().describe('The ID of the memory to update'),
        newContent: z.string().describe('The new content of the memory')
      }),
      // @ts-expect-error AI SDK tool execute types are narrower than these local tool adapters.
      execute: async ({ id, newContent }: { id: string, newContent: string }) => {
        const { executeUpdateMemory } = await import('../../../../../../packages/agent/src/agent-loop');
        const result = await executeUpdateMemory(id, newContent);
        return result;
      },
    }),
    delete_memory: tool({
      description: 'Delete a specific memory by its ID if it is no longer relevant or incorrect.',
      parameters: z.object({
        id: z.string().describe('The ID of the memory to delete')
      }),
      // @ts-expect-error AI SDK tool execute types are narrower than these local tool adapters.
      execute: async ({ id }: { id: string }) => {
        const { executeDeleteMemory } = await import('../../../../../../packages/agent/src/agent-loop');
        const result = await executeDeleteMemory(id);
        return result;
      },
    }),
    query_graph: tool({
      description: 'Search the local knowledge graph for entities related to a concept, project, person, task, or technology.',
      parameters: z.object({
        query: z.string().describe('The graph search query'),
      }),
      // @ts-expect-error AI SDK tool execute types are narrower than these local tool adapters.
      execute: async ({ query }: { query: string }) => {
        return executeQueryGraph(query);
      },
    }),
    get_neighbors: tool({
      description: 'Get entities directly connected to a known graph entity.',
      parameters: z.object({
        entity: z.string().describe('The entity name to inspect'),
      }),
      // @ts-expect-error AI SDK tool execute types are narrower than these local tool adapters.
      execute: async ({ entity }: { entity: string }) => {
        return executeGetNeighbors(entity);
      },
    }),
    find_path: tool({
      description: 'Find a relationship path between two graph entities.',
      parameters: z.object({
        entityA: z.string().describe('The starting entity name'),
        entityB: z.string().describe('The target entity name'),
      }),
      // @ts-expect-error AI SDK tool execute types are narrower than these local tool adapters.
      execute: async ({ entityA, entityB }: { entityA: string, entityB: string }) => {
        return executeFindPath(entityA, entityB);
      },
    }),
    find_entities_by_type: tool({
      description: 'List graph entities of a specific type such as PROJECT, TASK, PERSON, ORG, TECHNOLOGY, or UNKNOWN.',
      parameters: z.object({
        type: z.string().describe('The graph entity type to list'),
      }),
      // @ts-expect-error AI SDK tool execute types are narrower than these local tool adapters.
      execute: async ({ type }: { type: string }) => {
        return executeFindEntitiesByType(type);
      },
    }),
  };



  const currentDate = new Date().toLocaleString();
  
  // Basic Workspace Context Engine
  let workspaceContext = `No specific workspace selected.`;
  if (workspaceId) {
    workspaceContext = `Active Workspace ID: ${workspaceId}
Memory retrieval is scoped to this workspace.`;
  }

  // --- Automatic Memory Injection ---
  // Get the latest user message to use as a semantic query
  const latestUserMessage = getMessageText(messages.filter((m) => m.role === 'user').pop());
  
  let memoryContextStr = "No relevant memories found in context.";
  if (latestUserMessage) {
    try {
      // Query top 3 most relevant memories for context injection
      const memoriesResult = await executeQueryMemoryRecords(workspaceId || 'default', latestUserMessage, 3);
      if (memoriesResult.length > 0) {
        // Filter by some confidence threshold (e.g. > 0.5)
        const relevantMemories = memoriesResult.filter(m => m.score > 0.5);
        if (relevantMemories.length > 0) {
          memoryContextStr = relevantMemories.map(m => `- [${(m.score*100).toFixed(1)}%] ${m.content} (Source: ${m.source})`).join('\n');
          console.log(`[Memory Engine] Auto-injected ${relevantMemories.length} memories for prompt: "${latestUserMessage.substring(0, 30)}..."`);
        }
      }
    } catch (e) {
      console.error("[Memory Engine] Failed to auto-inject memories:", e);
    }
  }

  const systemPrompt = `You are Torvaix, an AI Knowledge Operating System running locally on the user's machine.

[WORKSPACE CONTEXT ENGINE]
Current Date/Time: ${currentDate}
${workspaceContext}

[AUTONOMOUS MEMORY RETRIEVAL]
The following memories are highly relevant to the user's current query:
${memoryContextStr}

Your core advantage is accumulated knowledge: retrieve memories, inspect graph relationships, reason over context, and store durable insights when the user teaches you something important.

You have access to local tools: bash, read_file, python, web_search, store_memory, query_memory, update_memory, delete_memory, query_graph, get_neighbors, find_path, and find_entities_by_type.
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
    // @ts-expect-error maxSteps is supported at runtime by the installed AI SDK.
    maxSteps: 5, // Allow multi-step tool calls
  });

  // @ts-expect-error: type mismatch in vercel ai sdk types
  return result.toDataStreamResponse();
}
