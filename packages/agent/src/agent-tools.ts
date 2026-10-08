/**
 * The tools an agent can be given. One list feeds the "Available tools" part of the execution
 * prompt, the Agents page (through GET /api/agents) and the check that an agent only uses the
 * tools it was given.
 */

export type AgentToolId = 'write_file' | 'read_file' | 'bash' | 'python' | 'web_search' | 'repo_scan';

export interface AgentToolDefinition {
  id: AgentToolId;
  /** Short name for people. */
  label: string;
  /** What it lets the agent do, for people. */
  description: string;
  /** Whether every run needs the user's approval first. */
  needsApproval: boolean;
  /** The line that describes the tool to the model. */
  promptLine: string;
}

/** What the Agents page shows about a tool. */
export type AgentToolInfo = Omit<AgentToolDefinition, 'promptLine'>;

/** In the order the tools are listed to the model. Changing a promptLine changes every chat's prompt. */
export const AGENT_TOOLS: readonly AgentToolDefinition[] = [
  {
    id: 'write_file',
    label: 'Write files',
    description: 'Create or change files in the workspace folder.',
    needsApproval: false,
    promptLine: '- write_file: Write content to a file. Args: {"filePath": "path", "content": "file content"}',
  },
  {
    id: 'read_file',
    label: 'Read files',
    description: 'Read files in the workspace folder.',
    needsApproval: false,
    promptLine: '- read_file: Read a file. Args: {"filePath": "path"}',
  },
  {
    id: 'bash',
    label: 'Run shell commands',
    description: 'Run shell commands in the workspace folder. Every command needs your approval first.',
    needsApproval: true,
    promptLine: '- bash: Run a shell command. Args: {"command": "shell command"}',
  },
  {
    id: 'python',
    label: 'Run Python code',
    description: 'Run Python code in the workspace folder. Every run needs your approval first.',
    needsApproval: true,
    promptLine: '- python: Execute Python code. Args: {"code": "python code"}',
  },
  {
    id: 'web_search',
    label: 'Search the web',
    description: 'Look things up on the web.',
    needsApproval: false,
    promptLine: '- web_search: Search the web. Args: {"query": "search query"}',
  },
  {
    id: 'repo_scan',
    label: 'Scan the workspace',
    description: 'Get an overview of the workspace folder: its structure and dependencies.',
    needsApproval: false,
    promptLine: '- repo_scan: Scan the workspace architecture and dependencies. Args: {}',
  },
];

export function isAgentToolId(value: unknown): value is AgentToolId {
  return typeof value === 'string' && AGENT_TOOLS.some(tool => tool.id === value);
}

/** Keeps the known tool ids, drops repeats and puts them in the catalogue's order. */
export function normalizeAgentTools(value: unknown): AgentToolId[] {
  if (!Array.isArray(value)) return [];
  const wanted = new Set(value.filter(isAgentToolId));
  return AGENT_TOOLS.filter(tool => wanted.has(tool.id)).map(tool => tool.id);
}

/** The catalogue as the Agents page needs it. */
export function listAgentToolInfo(): AgentToolInfo[] {
  return AGENT_TOOLS.map(({ id, label, description, needsApproval }) => ({ id, label, description, needsApproval }));
}

/**
 * The tool list for the execution prompt. Without `allowed` it lists every tool, as chat always
 * has. With it, only those tools; an empty list tells the model to answer without tools.
 */
export function toolsPromptBlock(allowed?: readonly AgentToolId[]): string {
  const tools = allowed ? AGENT_TOOLS.filter(tool => allowed.includes(tool.id)) : AGENT_TOOLS;
  if (allowed && tools.length === 0) {
    return 'No tools are available. Answer the task directly, in your own words, with {"done": true, "message": "..."}.';
  }
  const lines = tools.map(tool => tool.promptLine).join('\n');
  return allowed ? `${lines}\nUse only these tools. Any other tool will not be run.` : lines;
}
