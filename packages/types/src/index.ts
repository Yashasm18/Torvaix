export type WorkspaceTemplate = 'general' | 'coding' | 'research' | 'university' | 'startup';

export interface Workspace {
  id: string;
  name: string;
  template: WorkspaceTemplate;
  createdAt: Date;
}

export type Role = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  chatId: string;
  role: Role;
  content: string;
  model?: string;
  provider?: string;
  createdAt: Date;
}

export interface Chat {
  id: string;
  workspaceId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Note {
  id: string;
  workspaceId: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoutingDecision {
  provider: string;
  confidence: number;
  reason: string;
  breakdown: Record<string, number>;
}
