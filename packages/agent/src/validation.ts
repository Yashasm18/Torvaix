import { AUTOMATION_EVENTS } from '@torvaix/events';

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
  input: { triggerType?: unknown; triggerConfig?: unknown; actionType?: unknown; status?: unknown },
  events: readonly string[] = DEFAULT_EVENTS
): string | null {
  const { triggerType, actionType, status } = input;
  const config = (input.triggerConfig && typeof input.triggerConfig === 'object' ? input.triggerConfig : {}) as Record<string, unknown>;

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
  return null;
}
