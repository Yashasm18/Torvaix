import mitt from 'mitt';

type Events = {
  MEMORY_CREATED: { id: string; workspaceId: string; source: string; content: string };
  MEMORY_UPDATED: { id: string; newContent: string };
  MEMORY_DELETED: { id: string };
  
  TASK_CREATED: { id: string; title: string; status: string };
  TASK_COMPLETED: { id: string };

  AGENT_STARTED: { agentId: string; workspaceId: string; task: string };
  AGENT_FINISHED: { agentId: string; result: string };
};

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
