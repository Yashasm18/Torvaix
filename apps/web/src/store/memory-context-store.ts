import { create } from 'zustand';

export interface RetrievedMemory {
  id: string;
  content: string;
  source: string;
  score: number;
}

interface MemoryContextState {
  retrievedMemories: RetrievedMemory[];
  lastRetrievedAt: Date | null;
  averageConfidence: number;
  setRetrievedMemories: (memories: RetrievedMemory[]) => void;
  clearMemories: () => void;
}

export const useMemoryContextStore = create<MemoryContextState>((set) => ({
  retrievedMemories: [],
  lastRetrievedAt: null,
  averageConfidence: 0,

  setRetrievedMemories: (memories) => {
    const avg = memories.length > 0 
      ? memories.reduce((acc, curr) => acc + curr.score, 0) / memories.length 
      : 0;
      
    set({
      retrievedMemories: memories,
      lastRetrievedAt: new Date(),
      averageConfidence: Math.round(avg * 100),
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
