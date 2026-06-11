import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';

const execAsync = promisify(exec);

export interface ToolResult {
  tool: string;
  output: string;
  success: boolean;
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
 * Parses markdown output from an LLM stream looking for Odysseus-style fenced tool blocks:
 * ```bash
 * ls -la
 * ```
 */
export function parseToolBlocks(llmOutput: string): { tool: string; args: string }[] {
  const tools = [];
  const regex = /```(bash|read_file|python)\n([\s\S]*?)```/g;
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
 */
export async function runAgentLoop(instructions: string, modelUrl: string = 'http://localhost:11434/api/generate') {
  console.log(`[Agent] Booting offline loop with model: ${modelUrl}`);
  console.log(`[Agent] Instructions: ${instructions}`);
  
  // In a full implementation, this would:
  // 1. Send instructions to local Ollama
  // 2. Stream response
  // 3. Intercept ```bash or ```read_file blocks
  // 4. Execute them via executeBash / executeReadFile
  // 5. Feed output back into local Ollama
  // 6. Loop until finished
  
  return { status: 'initialized_offline_loop' };
}
