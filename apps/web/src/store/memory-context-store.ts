import { create } from 'zustand';

export interface RetrievedMemory {
  id: string;
  content: string;
  source: string;
  score: number;
}

export interface DetectedEntity {
  text: string;
  type: string;
}

export interface KnowledgeRelationship {
  source: string;
  relation: string;
  target: string;
  confidence?: number;
}

export type KnowledgeEventType =
  | 'memory_retrieved'
  | 'entity_detected'
  | 'relationship_created'
  | 'graph_updated'
  | 'agent_tool_used';

export interface KnowledgeEvent {
  id: string;
  type: KnowledgeEventType;
  label: string;
  timestamp: Date;
}

export interface KnowledgePulseState {
  retrievedMemories: RetrievedMemory[];
  detectedEntities: DetectedEntity[];
  relationships: KnowledgeRelationship[];
  graphActivity: {
    nodesAdded: number;
    relationshipsAdded: number;
    updated: boolean;
  };
  agentSteps: string[];
  events: KnowledgeEvent[];
  lastUpdatedAt: Date | null;
}

interface MemoryContextState {
  retrievedMemories: RetrievedMemory[];
  detectedEntities: DetectedEntity[];
  relationships: KnowledgeRelationship[];
  graphActivity: KnowledgePulseState['graphActivity'];
  agentSteps: string[];
  events: KnowledgeEvent[];
  lastUpdatedAt: Date | null;
  lastRetrievedAt: Date | null;
  averageConfidence: number;
  setRetrievedMemories: (memories: RetrievedMemory[]) => void;
  setDetectedEntities: (entities: DetectedEntity[]) => void;
  setRelationships: (relationships: KnowledgeRelationship[]) => void;
  setGraphActivity: (activity: Partial<KnowledgePulseState['graphActivity']>) => void;
  setAgentSteps: (steps: string[]) => void;
  addKnowledgeEvent: (type: KnowledgeEventType, label: string) => void;
  resetKnowledgePulse: () => void;
  clearMemories: () => void;
}

const createEvent = (type: KnowledgeEventType, label: string): KnowledgeEvent => ({
  id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  type,
  label,
  timestamp: new Date(),
});

export const useMemoryContextStore = create<MemoryContextState>((set) => ({
  retrievedMemories: [],
  detectedEntities: [],
  relationships: [],
  graphActivity: {
    nodesAdded: 0,
    relationshipsAdded: 0,
    updated: false,
  },
  agentSteps: [],
  events: [],
  lastUpdatedAt: null,
  lastRetrievedAt: null,
  averageConfidence: 0,

  setRetrievedMemories: (memories) => {
    const avg = memories.length > 0 
      ? memories.reduce((acc, curr) => acc + curr.score, 0) / memories.length 
      : 0;
      
    set((state) => ({
      retrievedMemories: memories,
      lastRetrievedAt: new Date(),
      lastUpdatedAt: new Date(),
      averageConfidence: Math.round(avg * 100),
      events: [
        ...state.events,
        ...memories.map((memory) => createEvent('memory_retrieved', memory.content)),
      ].slice(-20),
    }));
  },

  setDetectedEntities: (entities) => {
    set((state) => ({
      detectedEntities: entities,
      lastUpdatedAt: new Date(),
      events: [
        ...state.events,
        ...entities.map((entity) => createEvent('entity_detected', `${entity.text} (${entity.type})`)),
      ].slice(-20),
    }));
  },

  setRelationships: (relationships) => {
    set((state) => ({
      relationships,
      lastUpdatedAt: new Date(),
      events: [
        ...state.events,
        ...relationships.map((relationship) => createEvent(
          'relationship_created',
          `${relationship.source} -> ${relationship.relation} -> ${relationship.target}`
        )),
      ].slice(-20),
    }));
  },

  setGraphActivity: (activity) => {
    set((state) => {
      const nextActivity = {
        ...state.graphActivity,
        ...activity,
        updated: activity.updated ?? true,
      };

      return {
        graphActivity: nextActivity,
        lastUpdatedAt: new Date(),
        events: [
          ...state.events,
          createEvent(
            'graph_updated',
            `+${nextActivity.nodesAdded} nodes, +${nextActivity.relationshipsAdded} relationships`
          ),
        ].slice(-20),
      };
    });
  },

  setAgentSteps: (steps) => {
    set((state) => ({
      agentSteps: steps,
      lastUpdatedAt: new Date(),
      events: [
        ...state.events,
        ...steps.map((step) => createEvent('agent_tool_used', step)),
      ].slice(-20),
    }));
  },

  addKnowledgeEvent: (type, label) => {
    set((state) => ({
      events: [...state.events, createEvent(type, label)].slice(-20),
      lastUpdatedAt: new Date(),
    }));
  },

  resetKnowledgePulse: () => {
    set({
      retrievedMemories: [],
      detectedEntities: [],
      relationships: [],
      graphActivity: {
        nodesAdded: 0,
        relationshipsAdded: 0,
        updated: false,
      },
      agentSteps: [],
      events: [],
      lastUpdatedAt: null,
      lastRetrievedAt: null,
      averageConfidence: 0,
    });
  },

  clearMemories: () => {
    set({
      retrievedMemories: [],
      lastRetrievedAt: null,
      averageConfidence: 0,
    });
  },
}));
