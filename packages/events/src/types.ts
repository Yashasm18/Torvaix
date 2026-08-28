export type TriggerType = 'schedule' | 'event' | 'manual';

export type ScheduleFrequency = 'interval' | 'hourly' | 'daily' | 'weekly' | 'custom';

export interface TriggerConfig {
  frequency?: ScheduleFrequency;
  intervalMinutes?: number;
  timeOfDay?: string; // "09:00"
  dayOfWeek?: number; // 0 = Sunday, 1 = Monday ... 6 = Saturday
  cron?: string;
  eventName?: 'MEMORY_CREATED' | 'MEMORY_UPDATED' | 'MEMORY_DELETED' | 'TASK_CREATED' | 'TASK_COMPLETED' | 'AGENT_STARTED' | 'AGENT_FINISHED' | string;
  filterPattern?: string;
}

export type ActionType = 
  | 'agent_task' 
  | 'consolidate_memory' 
  | 'synthesize_graph' 
  | 'clean_stale_memories' 
  | 'mcp_tool';

export interface ActionConfig {
  prompt?: string;
  toolName?: string;
  toolParams?: Record<string, any>;
  decayThreshold?: number;
}

export type ActionExecutor = (workflow: AutomationWorkflow, triggerPayload?: any) => Promise<{ success: boolean; output: string }>;

export type AutomationStatus = 'active' | 'paused' | 'draft';


export interface AutomationWorkflow {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  triggerType: TriggerType;
  triggerConfig: TriggerConfig;
  actionType: ActionType;
  actionConfig: ActionConfig;
  status: AutomationStatus;
  lastRunAt?: string | null;
  runCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowExecutionLog {
  id: string;
  automationId: string;
  workspaceId: string;
  status: 'running' | 'success' | 'error';
  output: string;
  durationMs: number;
  startedAt: string;
  completedAt?: string | null;
}

export interface AutomationStats {
  totalAutomations: number;
  activeCount: number;
  pausedCount: number;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
}
