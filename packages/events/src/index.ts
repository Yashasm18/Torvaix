import mitt from 'mitt';

// Every event carries its workspaceId: the automation engine only runs workflows from the
// workspace the event happened in.
type Events = {
  MEMORY_CREATED: { id: string; workspaceId: string; source: string; content: string };
  MEMORY_UPDATED: { id: string; workspaceId: string; newContent: string };
  MEMORY_DELETED: { id: string; workspaceId: string };

  /** A task dispatched from the Tasks page. */
  TASK_CREATED: { id: string; workspaceId: string; instructions: string };
  TASK_COMPLETED: { id: string; workspaceId: string; instructions: string; output: string };

  /** A chat or task run. Runs started by automations don't emit these, so workflows can't trigger each other in a loop. */
  AGENT_STARTED: { agentId: string; workspaceId: string; task: string };
  AGENT_FINISHED: { agentId: string; workspaceId: string; task: string; status: 'completed' | 'awaiting_approval' | 'error'; result: string };
};

/** Events the automation engine listens to, and the Automation page offers as triggers. */
export const AUTOMATION_EVENTS = [
  'MEMORY_CREATED',
  'MEMORY_UPDATED',
  'MEMORY_DELETED',
  'TASK_CREATED',
  'TASK_COMPLETED',
  'AGENT_STARTED',
  'AGENT_FINISHED',
] as const satisfies readonly (keyof Events)[];

export const eventBus = mitt<Events>();

export const torvaixEvents = {
  emitMemoryCreated: (data: Events['MEMORY_CREATED']) => eventBus.emit('MEMORY_CREATED', data),
  emitMemoryUpdated: (data: Events['MEMORY_UPDATED']) => eventBus.emit('MEMORY_UPDATED', data),
  emitMemoryDeleted: (data: Events['MEMORY_DELETED']) => eventBus.emit('MEMORY_DELETED', data),

  emitTaskCreated: (data: Events['TASK_CREATED']) => eventBus.emit('TASK_CREATED', data),
  emitTaskCompleted: (data: Events['TASK_COMPLETED']) => eventBus.emit('TASK_COMPLETED', data),

  emitAgentStarted: (data: Events['AGENT_STARTED']) => eventBus.emit('AGENT_STARTED', data),
  emitAgentFinished: (data: Events['AGENT_FINISHED']) => eventBus.emit('AGENT_FINISHED', data),

  on: eventBus.on,
  off: eventBus.off,
};

export * from './types';
export * from './engine';


