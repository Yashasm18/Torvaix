import { v4 as uuidv4 } from 'uuid';
import { eventBus } from './index';
import type { 
  AutomationWorkflow, 
  WorkflowExecutionLog, 
  ActionExecutor
} from './types';

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
        if (this.isWorkflowDue(workflow, now)) {
          // Execute asynchronously in background
          this.executeWorkflow(workflow, { source: 'schedule', timestamp: now.toISOString() }).catch(err => {
            console.error(`[AutomationEngine] Execution error for ${workflow.id}:`, err);
          });
        }
      }
    } catch (error) {
      console.error('[AutomationEngine] Error evaluating scheduled workflows:', error);
    }
  }

  /**
   * Check if a scheduled workflow is due for execution.
   */
  public isWorkflowDue(workflow: AutomationWorkflow, now = new Date()): boolean {
    const { frequency = 'interval', intervalMinutes = 60, timeOfDay, dayOfWeek } = workflow.triggerConfig;
    const lastRun = workflow.lastRunAt ? new Date(workflow.lastRunAt) : null;

    if (!lastRun) {
      // First run is immediately due
      return true;
    }

    const elapsedMs = now.getTime() - lastRun.getTime();

    if (frequency === 'interval') {
      const requiredMs = Math.max(1, intervalMinutes) * 60 * 1000;
      return elapsedMs >= requiredMs;
    }

    if (frequency === 'hourly') {
      return elapsedMs >= 60 * 60 * 1000;
    }

    if (frequency === 'daily') {
      // Check if at least 20 hours passed and time matches or 24h passed
      if (elapsedMs >= 24 * 60 * 60 * 1000) return true;
      if (timeOfDay) {
        const [targetHour, targetMinute] = timeOfDay.split(':').map(Number);
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const isTargetTime = currentHour === targetHour && Math.abs(currentMinute - (targetMinute || 0)) <= 5;
        const isDifferentDay = now.toDateString() !== lastRun.toDateString();
        return isTargetTime && isDifferentDay;
      }
      return elapsedMs >= 24 * 60 * 60 * 1000;
    }

    if (frequency === 'weekly') {
      if (elapsedMs >= 7 * 24 * 60 * 60 * 1000) return true;
      if (dayOfWeek !== undefined) {
        const isTargetDay = now.getDay() === dayOfWeek;
        const isDifferentWeek = elapsedMs >= 6 * 24 * 60 * 60 * 1000;
        return isTargetDay && isDifferentWeek;
      }
      return elapsedMs >= 7 * 24 * 60 * 60 * 1000;
    }

    return elapsedMs >= 60 * 60 * 1000;
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
          const content = typeof payload === 'string' ? payload : JSON.stringify(payload);
          try {
            const regex = new RegExp(workflow.triggerConfig.filterPattern, 'i');
            if (!regex.test(content)) continue;
          } catch {
            if (!content.toLowerCase().includes(workflow.triggerConfig.filterPattern.toLowerCase())) {
              continue;
            }
          }
        }

        await this.executeWorkflow(workflow, { source: 'event', eventName, payload });
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
