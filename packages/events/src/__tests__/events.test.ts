import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  torvaixEvents, 
  AutomationEngine, 
  AutomationWorkflow, 
  WorkflowExecutionLog, 
  AutomationStorage 
} from '../index';

class MockStorage implements AutomationStorage {
  public workflows: AutomationWorkflow[] = [];
  public logs: WorkflowExecutionLog[] = [];

  listAutomations(workspaceId?: string): AutomationWorkflow[] {
    if (!workspaceId) return this.workflows;
    return this.workflows.filter(w => w.workspaceId === workspaceId);
  }

  getAutomation(id: string): AutomationWorkflow | null {
    return this.workflows.find(w => w.id === id) || null;
  }

  updateAutomation(id: string, updates: Partial<AutomationWorkflow>): boolean {
    const idx = this.workflows.findIndex(w => w.id === id);
    if (idx === -1) return false;
    this.workflows[idx] = { ...this.workflows[idx], ...updates };
    return true;
  }

  logAutomationRun(log: WorkflowExecutionLog): void {
    this.logs.push(log);
  }
}

describe('@torvaix/events - Event Bus & Automation Engine', () => {
  let storage: MockStorage;
  let engine: AutomationEngine;

  beforeEach(() => {
    storage = new MockStorage();
    engine = new AutomationEngine(storage);
  });

  it('emits and captures domain events correctly', () => {
    const handler = vi.fn();
    torvaixEvents.on('MEMORY_CREATED', handler);

    torvaixEvents.emitMemoryCreated({
      id: 'mem-1',
      workspaceId: 'default',
      source: 'unit-test',
      content: 'Hello memory world'
    });

    expect(handler).toHaveBeenCalledWith({
      id: 'mem-1',
      workspaceId: 'default',
      source: 'unit-test',
      content: 'Hello memory world'
    });

    torvaixEvents.off('MEMORY_CREATED', handler);
  });

  it('evaluates scheduled workflow due states accurately', () => {
    const now = new Date('2026-08-28T12:00:00Z');

    const workflowInterval: AutomationWorkflow = {
      id: 'wf-1',
      workspaceId: 'default',
      name: 'Interval Task',
      description: 'Runs every 30 mins',
      triggerType: 'schedule',
      triggerConfig: { frequency: 'interval', intervalMinutes: 30 },
      actionType: 'agent_task',
      actionConfig: { prompt: 'Do research' },
      status: 'active',
      lastRunAt: new Date(now.getTime() - 35 * 60 * 1000).toISOString(),
      runCount: 2,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    expect(engine.isWorkflowDue(workflowInterval, now)).toBe(true);

    // If ran 10 minutes ago, not due
    workflowInterval.lastRunAt = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    expect(engine.isWorkflowDue(workflowInterval, now)).toBe(false);

    // If never ran, immediately due
    workflowInterval.lastRunAt = null;
    expect(engine.isWorkflowDue(workflowInterval, now)).toBe(true);
  });

  it('executes workflow, records execution log, and updates run metrics', async () => {
    const workflow: AutomationWorkflow = {
      id: 'wf-exec-1',
      workspaceId: 'default',
      name: 'Consolidate Memories',
      description: 'Auto consolidation',
      triggerType: 'manual',
      triggerConfig: {},
      actionType: 'consolidate_memory',
      actionConfig: {},
      status: 'active',
      runCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    storage.workflows.push(workflow);

    const actionHandler = vi.fn().mockResolvedValue({
      success: true,
      output: 'Consolidation report: 4 clusters created.'
    });
    engine.setActionHandler(actionHandler);

    const log = await engine.executeWorkflow(workflow);

    expect(actionHandler).toHaveBeenCalledWith(workflow, undefined);
    expect(log.status).toBe('success');
    expect(log.output).toContain('4 clusters created');
    expect(log.durationMs).toBeGreaterThanOrEqual(0);

    // Check storage updates
    expect(storage.logs.length).toBe(1);
    expect(storage.logs[0].output).toContain('4 clusters created');
    expect(storage.workflows[0].runCount).toBe(1);
    expect(storage.workflows[0].lastRunAt).toBeDefined();
  });

  it('triggers matching event-driven workflows with filter pattern support', async () => {
    const matchingWorkflow: AutomationWorkflow = {
      id: 'wf-event-1',
      workspaceId: 'default',
      name: 'React Indexer',
      description: 'Trigger on React memories',
      triggerType: 'event',
      triggerConfig: {
        eventName: 'MEMORY_CREATED',
        filterPattern: 'React'
      },
      actionType: 'synthesize_graph',
      actionConfig: {},
      status: 'active',
      runCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const nonMatchingWorkflow: AutomationWorkflow = {
      id: 'wf-event-2',
      workspaceId: 'default',
      name: 'Python Indexer',
      description: 'Trigger on Python memories',
      triggerType: 'event',
      triggerConfig: {
        eventName: 'MEMORY_CREATED',
        filterPattern: 'Python'
      },
      actionType: 'synthesize_graph',
      actionConfig: {},
      status: 'active',
      runCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    storage.workflows.push(matchingWorkflow, nonMatchingWorkflow);

    const actionHandler = vi.fn().mockResolvedValue({
      success: true,
      output: 'Graph synthesized for React'
    });
    engine.setActionHandler(actionHandler);

    await engine.handleEventTrigger('MEMORY_CREATED', {
      workspaceId: 'default',
      content: 'I love React 19 and Next.js 16'
    });

    expect(actionHandler).toHaveBeenCalledTimes(1);
    expect(actionHandler).toHaveBeenCalledWith(
      matchingWorkflow, 
      expect.objectContaining({ eventName: 'MEMORY_CREATED' })
    );
  });

  it('does not start a second run of a scheduled workflow while one is still in flight', async () => {
    const workflow: AutomationWorkflow = {
      id: 'slow-scheduled',
      workspaceId: 'default',
      name: 'Slow agent task',
      description: '',
      triggerType: 'schedule',
      triggerConfig: { frequency: 'interval', intervalMinutes: 60 },
      actionType: 'agent_task',
      actionConfig: {},
      status: 'active',
      lastRunAt: null,
      runCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.workflows.push(workflow);

    let releaseRun!: () => void;
    const handler = vi.fn(() => new Promise<{ success: boolean; output: string }>(resolve => {
      releaseRun = () => resolve({ success: true, output: 'done' });
    }));
    const slowEngine = new AutomationEngine(storage, handler);

    slowEngine.checkScheduledWorkflows();
    slowEngine.checkScheduledWorkflows();
    slowEngine.checkScheduledWorkflows();
    expect(handler).toHaveBeenCalledTimes(1);

    releaseRun();
    await vi.waitFor(() => expect(storage.logs.length).toBe(1));

    // Finished run recorded lastRunAt, so the next tick inside the interval is not due.
    slowEngine.checkScheduledWorkflows();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not trigger paused or draft workflows', async () => {
    const pausedWorkflow: AutomationWorkflow = {
      id: 'wf-paused',
      workspaceId: 'default',
      name: 'Paused Task',
      description: 'Should not run',
      triggerType: 'event',
      triggerConfig: { eventName: 'TASK_COMPLETED' },
      actionType: 'agent_task',
      actionConfig: {},
      status: 'paused',
      runCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    storage.workflows.push(pausedWorkflow);

    const actionHandler = vi.fn();
    engine.setActionHandler(actionHandler);

    await engine.handleEventTrigger('TASK_COMPLETED', { workspaceId: 'default' });

    expect(actionHandler).not.toHaveBeenCalled();
  });
});

describe('AutomationEngine — calendar-aware scheduling & loop safety', () => {
  // 2026-09-14 is a Monday. Local-time constructors keep these independent of the machine's timezone.
  const at = (day: number, hours: number, minutes = 0, seconds = 0) => new Date(2026, 8, day, hours, minutes, seconds);
  const workflow = (triggerConfig: AutomationWorkflow['triggerConfig'], extra: Partial<AutomationWorkflow> = {}): AutomationWorkflow => ({
    id: 'wf',
    workspaceId: 'default',
    name: 'Scheduled',
    description: '',
    triggerType: 'schedule',
    triggerConfig,
    actionType: 'agent_task',
    actionConfig: {},
    status: 'active',
    lastRunAt: null,
    runCount: 0,
    createdAt: at(14, 15).toISOString(),
    updatedAt: at(14, 15).toISOString(),
    ...extra,
  });
  const engine = new AutomationEngine(new MockStorage());

  it('does not fire a "daily at 09:00" workflow when it is created; waits for 09:00', () => {
    const daily = workflow({ frequency: 'daily', timeOfDay: '09:00' });
    expect(engine.isWorkflowDue(daily, at(14, 15, 1))).toBe(false);
    expect(engine.isWorkflowDue(daily, at(15, 8, 59))).toBe(false);
    expect(engine.isWorkflowDue(daily, at(15, 9, 0))).toBe(true);
  });

  it('runs once per day and catches up an occurrence missed while the server was off', () => {
    const daily = workflow({ frequency: 'daily', timeOfDay: '09:00' }, { lastRunAt: at(15, 9, 0, 30).toISOString() });
    expect(engine.isWorkflowDue(daily, at(15, 23, 0))).toBe(false);
    expect(engine.isWorkflowDue(daily, at(16, 13, 0))).toBe(true);
  });

  it('handles scheduled times near the hour boundary', () => {
    const daily = workflow({ frequency: 'daily', timeOfDay: '09:58' }, { lastRunAt: at(14, 10, 0).toISOString() });
    expect(engine.isWorkflowDue(daily, at(15, 10, 1))).toBe(true);
  });

  it('weekly honours dayOfWeek, and otherwise repeats on the weekday it was created', () => {
    const sundays = workflow({ frequency: 'weekly', dayOfWeek: 0, timeOfDay: '02:00' });
    expect(engine.isWorkflowDue(sundays, at(19, 23, 0))).toBe(false); // Saturday
    expect(engine.isWorkflowDue(sundays, at(20, 2, 0))).toBe(true); // Sunday 02:00

    const creationWeekday = workflow({ frequency: 'weekly', timeOfDay: '09:00' });
    expect(engine.isWorkflowDue(creationWeekday, at(20, 9, 0))).toBe(false); // Sunday
    expect(engine.isWorkflowDue(creationWeekday, at(21, 9, 0))).toBe(true); // next Monday
  });

  it('accepts SQLite UTC timestamps for createdAt', () => {
    const created = at(14, 15);
    const sqlite = created.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
    const daily = workflow({ frequency: 'daily', timeOfDay: '09:00' }, { createdAt: sqlite });
    expect(engine.isWorkflowDue(daily, at(14, 16, 0))).toBe(false);
    expect(engine.isWorkflowDue(daily, at(15, 9, 0))).toBe(true);
  });

  it('does not let an event workflow re-trigger itself while it is running', async () => {
    const storage = new MockStorage();
    storage.workflows.push(workflow({ eventName: 'MEMORY_CREATED' }, { id: 'loop', triggerType: 'event' }));

    let loopEngine!: AutomationEngine;
    const handler = vi.fn(async () => {
      // The action stores a memory, which emits MEMORY_CREATED again.
      await loopEngine.handleEventTrigger('MEMORY_CREATED', { workspaceId: 'default' });
      return { success: true, output: 'ok' };
    });
    loopEngine = new AutomationEngine(storage, handler);

    await loopEngine.handleEventTrigger('MEMORY_CREATED', { workspaceId: 'default' });
    expect(handler).toHaveBeenCalledTimes(1);

    // A separate, later event still runs it.
    await loopEngine.handleEventTrigger('MEMORY_CREATED', { workspaceId: 'default' });
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
