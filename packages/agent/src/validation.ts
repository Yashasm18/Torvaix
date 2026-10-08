import { AUTOMATION_EVENTS } from '@torvaix/events';
import { AGENT_TOOLS, isAgentToolId, normalizeAgentTools, type AgentToolId } from './agent-tools';

const DEFAULT_EVENTS: readonly string[] = AUTOMATION_EVENTS;

/**
 * Email shape check without a backtracking regex (the previous
 * /^[^\s@]+@[^\s@]+\.[^\s@]+$/ was flagged as polynomial ReDoS on crafted input).
 * Deliberately permissive: one "@", non-empty local part, a dot inside the domain, no whitespace.
 */
export function isValidEmail(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 254) return false;
  if (/\s/.test(value)) return false;

  const at = value.indexOf('@');
  if (at <= 0 || at !== value.lastIndexOf('@')) return false;

  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  return local.length <= 64 && dot > 0 && dot < domain.length - 1;
}

const TRIGGER_TYPES = ['schedule', 'event', 'manual'];
/** Action types the automation engine can actually run. */
const ACTION_TYPES = ['agent_task', 'consolidate_memory', 'synthesize_graph', 'clean_stale_memories'];
const STATUSES = ['active', 'paused', 'draft'];
const FREQUENCIES = ['interval', 'hourly', 'daily', 'weekly'];

/**
 * Checks an automation's trigger and action. Returns an error message, or null when valid.
 * Unknown values used to be stored and then "succeed" without doing anything, or never fire.
 */
export function validateAutomationInput(
  input: { triggerType?: unknown; triggerConfig?: unknown; actionType?: unknown; actionConfig?: unknown; status?: unknown },
  events: readonly string[] = DEFAULT_EVENTS
): string | null {
  const { triggerType, actionType, status } = input;
  // Settings are stored as JSON objects. A string or list here used to be saved as-is and made
  // every later read of the automation fail.
  for (const field of ['triggerConfig', 'actionConfig'] as const) {
    if (input[field] !== undefined && !isPlainObject(input[field])) return `${field} must be an object`;
  }
  const config = (input.triggerConfig ?? {}) as Record<string, unknown>;
  const action = (input.actionConfig ?? {}) as Record<string, unknown>;

  if (typeof triggerType !== 'string' || !TRIGGER_TYPES.includes(triggerType)) {
    return `triggerType must be one of: ${TRIGGER_TYPES.join(', ')}`;
  }
  if (typeof actionType !== 'string' || !ACTION_TYPES.includes(actionType)) {
    return `actionType must be one of: ${ACTION_TYPES.join(', ')}`;
  }
  if (status !== undefined && (typeof status !== 'string' || !STATUSES.includes(status))) {
    return `status must be one of: ${STATUSES.join(', ')}`;
  }
  if (triggerType === 'event' && (typeof config.eventName !== 'string' || !events.includes(config.eventName))) {
    return `An event trigger needs eventName, one of: ${events.join(', ')}`;
  }
  if (triggerType === 'schedule' && config.frequency !== undefined &&
      (typeof config.frequency !== 'string' || !FREQUENCIES.includes(config.frequency))) {
    return `frequency must be one of: ${FREQUENCIES.join(', ')}`;
  }
  if (action.prompt !== undefined && (typeof action.prompt !== 'string' || action.prompt.length > LIMITS.instructionsChars)) {
    return `prompt must be text of at most ${LIMITS.instructionsChars.toLocaleString('en-US')} characters`;
  }
  // The agent that runs the task. Whether it still exists is checked when the automation runs,
  // so an automation whose agent was deleted can still be edited.
  if (action.agentId !== undefined && (typeof action.agentId !== 'string' || action.agentId.length > LIMITS.workspaceIdChars)) {
    return 'agentId must be the id of an agent';
  }
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ── Request input limits ──

export const LIMITS = {
  /** One stored memory. Large enough for a pasted file, small enough not to flood prompts or embeddings. */
  memoryChars: 100_000,
  /** A chat message or task instruction (attachments are capped at 100 KB in the UI). */
  instructionsChars: 150_000,
  messages: 200,
  workspaceIdChars: 200,
  nameChars: 200,
  descriptionChars: 2_000,
  topK: 50,
  agentNameChars: 80,
  agentDescriptionChars: 300,
  agentInstructionsChars: 4_000,
  agentsPerWorkspace: 50,
  /** Entries in an agent's tool list, before repeats are removed. */
  agentToolEntries: 50,
} as const;

/** `workspaceId` is optional, but when present it must be one plain string. */
export function validateWorkspaceId(value: unknown): string | null {
  if (value === undefined) return null;
  if (typeof value !== 'string' || value.length === 0 || value.length > LIMITS.workspaceIdChars || /[\u0000-\u001f]/.test(value)) {
    return 'workspaceId must be a single non-empty string';
  }
  return null;
}

/** Chat history sent along with a run. Returns an error message, or null when valid. */
export function validateMessages(value: unknown): string | null {
  if (value === undefined) return null;
  if (!Array.isArray(value)) return 'messages must be an array';
  if (value.length > LIMITS.messages) return `messages can have at most ${LIMITS.messages} entries`;
  for (const m of value) {
    if (!m || typeof m !== 'object') return 'each message must be an object with a role and content';
    const { role, content } = m as { role?: unknown; content?: unknown };
    if (role !== 'system' && role !== 'user' && role !== 'assistant') return 'message role must be "system", "user" or "assistant"';
    if (typeof content !== 'string') return 'message content must be a string';
    if (content.length > LIMITS.instructionsChars) return 'a message is too long';
  }
  return null;
}

export function validateText(value: unknown, field: string, max: number): string | null {
  if (typeof value !== 'string' || !value.trim()) return `${field} is required`;
  if (value.length > max) return `${field} is too long (at most ${max.toLocaleString('en-US')} characters)`;
  return null;
}

/** Clamps a client-supplied count to 1..max, falling back to `fallback` for anything that isn't a number. */
export function clampCount(value: unknown, fallback: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), 1), max);
}

// ── Custom agents ──

/** The editable parts of an agent, checked and cleaned up. */
export interface AgentFields {
  name: string;
  description: string;
  instructions: string;
  tools: AgentToolId[];
}

export type AgentInputResult<T> = { value: T; error?: undefined } | { error: string; value?: undefined };

/** Checks `tools`: a list of known tool ids. Repeats are removed and the order is the catalogue's. */
function validateAgentTools(value: unknown): AgentInputResult<AgentToolId[]> {
  if (!Array.isArray(value)) return { error: 'tools must be a list of tool ids' };
  if (value.length > LIMITS.agentToolEntries) return { error: `tools can have at most ${LIMITS.agentToolEntries} entries` };
  const unknown = value.find(tool => !isAgentToolId(tool));
  if (unknown !== undefined) {
    const shown = typeof unknown === 'string' ? `"${unknown.slice(0, 40)}"` : 'an entry that is not text';
    return { error: `Unknown tool ${shown}. Choose from: ${AGENT_TOOLS.map(t => t.id).join(', ')}` };
  }
  return { value: normalizeAgentTools(value) };
}

function validateOptionalDescription(value: unknown): AgentInputResult<string> {
  if (value === undefined) return { value: '' };
  if (typeof value !== 'string' || value.trim().length > LIMITS.agentDescriptionChars) {
    return { error: `description must be text of at most ${LIMITS.agentDescriptionChars} characters` };
  }
  return { value: value.trim() };
}

/** Text fields are trimmed before they are measured, so spaces around a name don't count against it. */
const trimmed = (value: unknown) => (typeof value === 'string' ? value.trim() : value);

/**
 * Checks the body of a request that makes an agent. `name`, `instructions` and `tools` are
 * required, `description` is optional. Returns the cleaned-up values, or an error message.
 */
export function validateAgentInput(body: unknown): AgentInputResult<AgentFields> {
  if (!isPlainObject(body)) return { error: 'The request body must be an object' };

  const invalid =
    validateText(trimmed(body.name), 'name', LIMITS.agentNameChars) ??
    validateText(trimmed(body.instructions), 'instructions', LIMITS.agentInstructionsChars);
  if (invalid) return { error: invalid };

  const description = validateOptionalDescription(body.description);
  if (description.error !== undefined) return { error: description.error };
  const tools = validateAgentTools(body.tools);
  if (tools.error !== undefined) return { error: tools.error };

  return {
    value: {
      name: (body.name as string).trim(),
      description: description.value,
      instructions: (body.instructions as string).trim(),
      tools: tools.value,
    },
  };
}

/** Like validateAgentInput for a change: every field is optional, and only the ones sent are checked and returned. */
export function validateAgentUpdate(body: unknown): AgentInputResult<Partial<AgentFields>> {
  if (!isPlainObject(body)) return { error: 'The request body must be an object' };
  const value: Partial<AgentFields> = {};

  if (body.name !== undefined) {
    const invalid = validateText(trimmed(body.name), 'name', LIMITS.agentNameChars);
    if (invalid) return { error: invalid };
    value.name = (body.name as string).trim();
  }
  if (body.description !== undefined) {
    const description = validateOptionalDescription(body.description);
    if (description.error !== undefined) return { error: description.error };
    value.description = description.value;
  }
  if (body.instructions !== undefined) {
    const invalid = validateText(trimmed(body.instructions), 'instructions', LIMITS.agentInstructionsChars);
    if (invalid) return { error: invalid };
    value.instructions = (body.instructions as string).trim();
  }
  if (body.tools !== undefined) {
    const tools = validateAgentTools(body.tools);
    if (tools.error !== undefined) return { error: tools.error };
    value.tools = tools.value;
  }
  return { value };
}
