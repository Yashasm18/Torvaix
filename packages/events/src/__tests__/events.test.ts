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
