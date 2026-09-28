import { describe, it, expect, vi } from 'vitest';
import { AutomationEngine, AUTOMATION_EVENTS, type AutomationStorage, type AutomationWorkflow } from '../index';

const workflow = (id: string, workspaceId: string, eventName: string): AutomationWorkflow => ({
  id,
  workspaceId,
  name: id,
  description: '',
  triggerType: 'event',
  triggerConfig: { eventName },
  actionType: 'consolidate_memory',
  actionConfig: {},
  status: 'active',
  runCount: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

function engineWith(workflows: AutomationWorkflow[]) {
  const storage: AutomationStorage = {
    listAutomations: (ws?: string) => (ws ? workflows.filter(w => w.workspaceId === ws) : workflows),
    getAutomation: id => workflows.find(w => w.id === id) ?? null,
    updateAutomation: () => true,
    logAutomationRun: () => {},
  };
  const engine = new AutomationEngine(storage);
  const ran = vi.fn(async (w: AutomationWorkflow) => ({ success: true, output: w.id }));
  engine.setActionHandler(ran);
  return { engine, ran };
}

describe('event triggers stay in their workspace', () => {
  it('runs only the workflows of the workspace the event happened in', async () => {
    const { engine, ran } = engineWith([workflow('a', 'ws-a', 'MEMORY_DELETED'), workflow('b', 'ws-b', 'MEMORY_DELETED')]);
    await engine.handleEventTrigger('MEMORY_DELETED', { id: 'm1', workspaceId: 'ws-a' });
    expect(ran.mock.calls.map(c => c[0].id)).toEqual(['a']);
  });

  it('ignores events without a workspace instead of running every workspace', async () => {
    const { engine, ran } = engineWith([workflow('a', 'ws-a', 'MEMORY_UPDATED'), workflow('b', 'ws-b', 'MEMORY_UPDATED')]);
    await engine.handleEventTrigger('MEMORY_UPDATED', { id: 'm1', newContent: 'x' });
    expect(ran).not.toHaveBeenCalled();
  });

  it('listens to every event the Automation page offers', () => {
    expect([...AUTOMATION_EVENTS].sort()).toEqual(
      ['AGENT_FINISHED', 'AGENT_STARTED', 'MEMORY_CREATED', 'MEMORY_DELETED', 'MEMORY_UPDATED', 'TASK_COMPLETED', 'TASK_CREATED']
    );
  });
});
