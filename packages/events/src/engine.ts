import { v4 as uuidv4 } from 'uuid';
import { eventBus } from './index';
import type { 
  AutomationWorkflow, 
  WorkflowExecutionLog, 
  ActionExecutor
} from './types';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const MAX_FILTER_INPUT = 10_000;

/** Parse ISO or SQLite "YYYY-MM-DD HH:MM:SS" (UTC, no zone) timestamps. */
export function parseTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null;
  const iso = value.includes('T') ? value : value.replace(' ', 'T');
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso);
  const date = new Date(hasZone ? iso : `${iso}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseTimeOfDay(value: unknown): { hours: number; minutes: number } | null {
  const match = typeof value === 'string' ? /^(\d{1,2}):(\d{2})$/.exec(value.trim()) : null;
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? { hours, minutes } : null;
}

/** Latest local date/time at or before `now` matching the time (and weekday, when given). */
function mostRecentOccurrence(now: Date, time: { hours: number; minutes: number }, weekday: number | null): Date {
  const occurrence = new Date(now);
  occurrence.setHours(time.hours, time.minutes, 0, 0);
  if (weekday === null) {
    if (occurrence > now) occurrence.setDate(occurrence.getDate() - 1);
  } else {
    occurrence.setDate(occurrence.getDate() - ((occurrence.getDay() - weekday + 7) % 7));
    if (occurrence > now) occurrence.setDate(occurrence.getDate() - 7);
  }
  return occurrence;
}

export type ActionHandler = (workflow: AutomationWorkflow, triggerPayload?: any) => Promise<{ success: boolean; output: string }>;

export interface AutomationStorage {
  listAutomations(workspaceId?: string): AutomationWorkflow[];
  getAutomation(id: string): AutomationWorkflow | null;
  updateAutomation(id: string, updates: Partial<AutomationWorkflow>): boolean;
  logAutomationRun(log: WorkflowExecutionLog): void;
}

export class AutomationEngine {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private actionHandler: ActionHandler | null = null;
  private storage: AutomationStorage;
  private eventListeners: Array<() => void> = [];

  constructor(storage: AutomationStorage, actionHandler?: ActionHandler) {
    this.storage = storage;
    if (actionHandler) {
      this.actionHandler = actionHandler;
    }
  }

  public setActionHandler(handler: ActionHandler) {
    this.actionHandler = handler;
  }

  /**
   * Start the scheduler background loop and register event listeners.
   */
  public start(checkIntervalMs = 60_000): void {
    if (this.isRunning) return;
    this.isRunning = true;

    this.registerEventListeners();

    // Run first schedule check immediately
    this.checkScheduledWorkflows();

    this.timer = setInterval(() => {
      this.checkScheduledWorkflows();
    }, checkIntervalMs);
  }

  /**
   * Stop the scheduler and unbind event listeners.
   */
  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.eventListeners.forEach(cleanup => cleanup());
    this.eventListeners = [];
    this.isRunning = false;
  }

  // Workflows currently running, from any trigger. lastRunAt is only written when a run
  // finishes, so without this a slow scheduled run looks "due" again on the next tick, and an
  // event workflow whose action emits its own trigger event (e.g. an agent task that stores a
  // memory on MEMORY_CREATED) would re-trigger itself endlessly.
  private inFlight = new Set<string>();

  /**
   * Evaluate scheduled workflows and trigger those that are due.
   */
  public checkScheduledWorkflows(now = new Date()): void {
    try {
      const allWorkflows = this.storage.listAutomations();
      const activeScheduled = allWorkflows.filter(
        w => w.status === 'active' && w.triggerType === 'schedule'
      );

      for (const workflow of activeScheduled) {
        if (this.inFlight.has(workflow.id)) continue;
        if (this.isWorkflowDue(workflow, now)) {
          this.inFlight.add(workflow.id);
          this.executeWorkflow(workflow, { source: 'schedule', timestamp: now.toISOString() })
            .catch(err => {
              console.error(`[AutomationEngine] Execution error for ${workflow.id}:`, err);
            })
            .finally(() => {
              this.inFlight.delete(workflow.id);
            });
        }
      }
    } catch (error) {
      console.error('[AutomationEngine] Error evaluating scheduled workflows:', error);
    }
  }

  /**
   * Check if a scheduled workflow is due for execution.
   *
   * - interval / hourly: due when the period has elapsed since the last run (first run immediately).
   * - daily / weekly with timeOfDay: due once the most recent scheduled occurrence is later than the
   *   last run, or than the creation time for a workflow that never ran. So "daily at 09:00" waits
   *   for 09:00 instead of firing on creation, and a missed occurrence (server off) runs once on
   *   the next tick. Weekly without dayOfWeek repeats on the weekday it was created / last ran.
   */
  public isWorkflowDue(workflow: AutomationWorkflow, now = new Date()): boolean {
    const { frequency = 'interval', intervalMinutes = 60, timeOfDay, dayOfWeek } = workflow.triggerConfig ?? {};
    const lastRun = parseTimestamp(workflow.lastRunAt);
    const elapsedMs = lastRun ? now.getTime() - lastRun.getTime() : Infinity;

    if (frequency === 'interval') {
      return elapsedMs >= Math.max(1, Number(intervalMinutes) || 60) * MINUTE_MS;
    }
    if (frequency === 'hourly') {
      return elapsedMs >= HOUR_MS;
    }

    if (frequency === 'daily' || frequency === 'weekly') {
      const time = parseTimeOfDay(timeOfDay);
      const periodMs = frequency === 'daily' ? DAY_MS : WEEK_MS;
      if (!time) return elapsedMs >= periodMs;

      const baseline = lastRun ?? parseTimestamp(workflow.createdAt);
      if (!baseline) return true;

      const weekday = frequency === 'weekly'
        ? (typeof dayOfWeek === 'number' && dayOfWeek >= 0 && dayOfWeek <= 6 ? dayOfWeek : baseline.getDay())
        : null;
      const occurrence = mostRecentOccurrence(now, time, weekday);
      return occurrence.getTime() > baseline.getTime();
    }

    return elapsedMs >= HOUR_MS;
  }

  /**
   * Register listeners for all workspace bus events.
   */
  private registerEventListeners(): void {
    const events: Array<'MEMORY_CREATED' | 'MEMORY_UPDATED' | 'MEMORY_DELETED' | 'TASK_CREATED' | 'TASK_COMPLETED' | 'AGENT_STARTED' | 'AGENT_FINISHED'> = [
      'MEMORY_CREATED',
      'MEMORY_UPDATED',
      'MEMORY_DELETED',
      'TASK_CREATED',
      'TASK_COMPLETED',
      'AGENT_STARTED',
      'AGENT_FINISHED'
    ];

    events.forEach(eventName => {
      const handler = (payload: any) => {
        this.handleEventTrigger(eventName, payload);
      };
      eventBus.on(eventName as any, handler);
      this.eventListeners.push(() => eventBus.off(eventName as any, handler));
    });
  }

  /**
   * Handle an event trigger and match against active event-driven workflows.
   */
  public async handleEventTrigger(eventName: string, payload: any): Promise<void> {
    try {
      const workspaceId = payload?.workspaceId;
      const allWorkflows = this.storage.listAutomations(workspaceId);
      const matchingWorkflows = allWorkflows.filter(
        w => w.status === 'active' && 
             w.triggerType === 'event' && 
             w.triggerConfig.eventName === eventName
      );

      for (const workflow of matchingWorkflows) {
        // Check filterPattern if specified
        if (workflow.triggerConfig.filterPattern && payload) {
          // User-supplied pattern: bound the input so a pathological regex can't stall the server.
          const content = (typeof payload === 'string' ? payload : JSON.stringify(payload)).slice(0, MAX_FILTER_INPUT);
          try {
            const regex = new RegExp(workflow.triggerConfig.filterPattern, 'i');
            if (!regex.test(content)) continue;
          } catch {
            if (!content.toLowerCase().includes(workflow.triggerConfig.filterPattern.toLowerCase())) {
              continue;
            }
          }
        }

        if (this.inFlight.has(workflow.id)) continue;
        this.inFlight.add(workflow.id);
        try {
          await this.executeWorkflow(workflow, { source: 'event', eventName, payload });
        } finally {
          this.inFlight.delete(workflow.id);
        }
      }
    } catch (error) {
      console.error(`[AutomationEngine] Error handling event ${eventName}:`, error);
    }
  }

  /**
   * Execute an automation workflow, record duration and logs, and update status.
   */
  public async executeWorkflow(
    workflow: AutomationWorkflow, 
    triggerContext?: any
  ): Promise<WorkflowExecutionLog> {
    const startTime = Date.now();
    const startedAt = new Date().toISOString();
    const logId = uuidv4();

    let status: 'success' | 'error' = 'success';
    let output = '';

    try {
      if (this.actionHandler) {
        const result = await this.actionHandler(workflow, triggerContext);
        status = result.success ? 'success' : 'error';
        output = result.output;
      } else {
        output = `Automation executed [${workflow.actionType}]: No custom action handler registered.`;
      }
    } catch (error: any) {
      status = 'error';
      output = `Execution failed: ${error.message || String(error)}`;
    }

    const durationMs = Date.now() - startTime;
    const completedAt = new Date().toISOString();

    const log: WorkflowExecutionLog = {
      id: logId,
      automationId: workflow.id,
      workspaceId: workflow.workspaceId,
      status,
      output,
      durationMs,
      startedAt,
      completedAt
    };

    // Update storage & workflow stats
    this.storage.logAutomationRun(log);
    this.storage.updateAutomation(workflow.id, {
      lastRunAt: completedAt,
      runCount: (workflow.runCount || 0) + 1,
      updatedAt: completedAt
    });

    return log;
  }
}
