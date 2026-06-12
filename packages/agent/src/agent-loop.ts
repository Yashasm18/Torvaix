import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import fetch from 'node-fetch';
import { MemoryStore } from '../../memory/src';
import path from 'path';

const execAsync = promisify(exec);

// Initialize Memory Store (using a local database file in the workspace)
const memoryDbPath = path.join(process.cwd(), 'torvaix_metadata.db');
const memoryStore = new MemoryStore(memoryDbPath);

export interface ToolResult {
  tool: string;
  output: string;
  success: boolean;
}

export async function executeStoreMemory(workspaceId: string, content: string, source: string): Promise<ToolResult> {
  try {
    await memoryStore.initQdrant();
    const id = await memoryStore.storeMemory(workspaceId, content, source);
    return {
      tool: 'store_memory',
      output: `Stored memory successfully with ID: ${id}`,
      success: true,
    };
  } catch (error: any) {
    return {
      tool: 'store_memory',
      output: error.message || String(error),
      success: false,
    };
  }
}

export async function executeQueryMemory(workspaceId: string, query: string, topK: number = 5): Promise<ToolResult> {
  try {
    await memoryStore.initQdrant();
    const results = await memoryStore.queryMemory(workspaceId, query, topK);
    const output = results.map(r => `[Score: ${r.score.toFixed(2)}] (Source: ${r.source}) ${r.content}`).join('\n\n');
    return {
      tool: 'query_memory',
      output: output || 'No relevant memories found.',
      success: true,
    };
  } catch (error: any) {
    return {
      tool: 'query_memory',
      output: error.message || String(error),
      success: false,
    };
  }
}

export async function executeUpdateMemory(id: string, newContent: string): Promise<ToolResult> {
  try {
    await memoryStore.initQdrant();
    await memoryStore.updateMemory(id, newContent);
    return {
      tool: 'update_memory',
      output: `Updated memory ${id} successfully.`,
      success: true,
    };
  } catch (error: any) {
    return {
      tool: 'update_memory',
      output: error.message || String(error),
      success: false,
    };
  }
}

export async function executeDeleteMemory(id: string): Promise<ToolResult> {
  try {
    await memoryStore.initQdrant();
    await memoryStore.deleteMemory(id);
    return {
      tool: 'delete_memory',
      output: `Deleted memory ${id} successfully.`,
      success: true,
    };
  } catch (error: any) {
    return {
      tool: 'delete_memory',
      output: error.message || String(error),
      success: false,
    };
  }
}

/**
 * Executes a local bash command.
 * IMPORTANT: This provides local OS access similar to Odysseus's `bash` tool.
 */
export async function executeBash(command: string): Promise<ToolResult> {
  try {
    const { stdout, stderr } = await execAsync(command);
    return {
      tool: 'bash',
      output: stdout || stderr,
      success: true,
    };
  } catch (error: any) {
    return {
      tool: 'bash',
      output: error.message || String(error),
      success: false,
    };
  }
}

/**
 * Reads a local file.
 */
export async function executeReadFile(filePath: string): Promise<ToolResult> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return {
      tool: 'read_file',
      output: content,
      success: true,
    };
  } catch (error: any) {
    return {
      tool: 'read_file',
      output: error.message || String(error),
      success: false,
    };
  }
}

/**
 * Executes Python code.
 */
export async function executePython(code: string): Promise<ToolResult> {
  try {
    const tempFile = `/tmp/temp_script_${Date.now()}.py`;
    await fs.writeFile(tempFile, code);
    const { stdout, stderr } = await execAsync(`python3 ${tempFile}`);
    await fs.unlink(tempFile);
    return {
      tool: 'python',
      output: stdout || stderr,
      success: true,
    };
  } catch (error: any) {
    return {
      tool: 'python',
      output: error.message || String(error),
      success: false,
    };
  }
}

/**
 * Searches the web for information.
 */
export async function executeWebSearch(query: string): Promise<ToolResult> {
  try {
    const response = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&pretty=1`);
    const data = await response.json() as any;
    const abstract = data.Abstract || 'No results found';
    const related = data.RelatedTopics?.slice(0, 5).map((topic: any) => topic.Text).join('\n') || '';
    return {
      tool: 'web_search',
      output: `Abstract: ${abstract}\n\nRelated Topics:\n${related}`,
      success: true,
    };
  } catch (error: any) {
    return {
      tool: 'web_search',
      output: error.message || String(error),
      success: false,
    };
  }
}

/**
 * Parses markdown output from an LLM stream looking for Odysseus-style fenced tool blocks:
 * ```bash
 * ls -la
 * ```
 */
export function parseToolBlocks(llmOutput: string): { tool: string; args: string }[] {
  const tools = [];
  const regex = /```(bash|read_file|python|web_search|store_memory|query_memory|update_memory|delete_memory)\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(llmOutput)) !== null) {
    tools.push({
      tool: match[1],
      args: match[2].trim()
    });
  }
  return tools;
}

/**
 * The core offline agent loop runner.
 * This implements a complete agent loop that can solve complex problems.
 */
export async function runAgentLoop(instructions: string, modelUrl: string = 'http://localhost:11434/api/generate') {
  console.log(`[Agent] Booting offline loop with model: ${modelUrl}`);
  console.log(`[Agent] Instructions: ${instructions}`);
  
  let currentInstructions = instructions;
  let iteration = 0;
  const maxIterations = 10;
  
  while (iteration < maxIterations) {
    iteration++;
    console.log(`[Agent] Iteration ${iteration}/${maxIterations}`);
    
    try {
      // Send current instructions to local Ollama
      const response = await fetch(modelUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama3.2',
          prompt: currentInstructions,
          stream: false,
          options: {
            temperature: 0.7,
            num_predict: 2000,
          }
        })
      });
      
      const data = await response.json() as any;
      const llmOutput = data.response || '';
      console.log(`[Agent] LLM Response: ${llmOutput.substring(0, 200)}...`);
      
      // Parse for tool blocks
      const toolBlocks = parseToolBlocks(llmOutput);
      
      if (toolBlocks.length === 0) {
        console.log(`[Agent] No tool blocks found, finishing task`);
        return {
          status: 'completed',
          iterations: iteration,
          finalOutput: llmOutput,
          toolsExecuted: []
        };
      }
      
      // Execute tools
      const toolResults: ToolResult[] = [];
      for (const block of toolBlocks) {
        console.log(`[Agent] Executing tool: ${block.tool} with args: ${block.args.substring(0, 100)}...`);
        
        let result: ToolResult;
        switch (block.tool) {
          case 'bash':
            result = await executeBash(block.args);
            break;
          case 'read_file':
            result = await executeReadFile(block.args);
            break;
          case 'python':
            result = await executePython(block.args);
            break;
          case 'web_search':
            result = await executeWebSearch(block.args);
            break;
          case 'store_memory':
            // Format: workspaceId|content|source
            const [storeWorkspace, storeContent, storeSource] = block.args.split('|');
            result = await executeStoreMemory(storeWorkspace, storeContent, storeSource);
            break;
          case 'query_memory':
            // Format: workspaceId|query|topK
            const [queryWorkspace, queryStr, topKStr] = block.args.split('|');
            result = await executeQueryMemory(queryWorkspace, queryStr, topKStr ? parseInt(topKStr) : 5);
            break;
          case 'update_memory':
            // Format: id|newContent
            const [updateId, updateContent] = block.args.split('|');
            result = await executeUpdateMemory(updateId, updateContent);
            break;
          case 'delete_memory':
            result = await executeDeleteMemory(block.args);
            break;
          default:
            result = {
              tool: block.tool,
              output: `Unknown tool: ${block.tool}`,
              success: false
            };
        }
        
        toolResults.push(result);
        console.log(`[Agent] Tool ${block.tool} result: ${result.success ? 'Success' : 'Failed'}`);
      }
      
      // Create feedback for next iteration
      const toolOutput = toolResults.map(r => 
        `Tool: ${r.tool}\nSuccess: ${r.success}\nOutput: ${r.output.substring(0, 500)}...`
      ).join('\n\n---\n\n');
      
      currentInstructions = `
Previous Instructions: ${currentInstructions}

Tool Execution Results:
${toolOutput}

Please continue with the original task, incorporating the results above. If the task is complete, respond with final output without tool blocks.
`;
      
    } catch (error) {
      console.error(`[Agent] Error in iteration ${iteration}:`, error);
      return {
        status: 'error',
        error: String(error),
        iteration: iteration,
        toolsExecuted: []
      };
    }
  }
  
  return {
    status: 'max_iterations_reached',
    iterations: iteration,
    toolsExecuted: []
  };
}
