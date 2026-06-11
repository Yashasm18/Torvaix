import { get, set } from 'idb-keyval';

export interface MemoryItem {
  id: string;
  content: string;
  timestamp: number;
}

const MEMORY_STORE_KEY = 'torvaix_brain_memory';

/**
 * Local offline storage for agent memories.
 * In a true vector DB (like LanceDB or sqlite-vec), this would store embeddings.
 * For this browser-based offline agent, we use idb-keyval for persistence.
 */
export async function addMemory(content: string): Promise<MemoryItem> {
  const memories = (await get<MemoryItem[]>(MEMORY_STORE_KEY)) || [];
  
  const newItem: MemoryItem = {
    id: crypto.randomUUID(),
    content,
    timestamp: Date.now(),
  };
  
  memories.push(newItem);
  await set(MEMORY_STORE_KEY, memories);
  return newItem;
}

export async function getMemories(): Promise<MemoryItem[]> {
  return (await get<MemoryItem[]>(MEMORY_STORE_KEY)) || [];
}

export async function removeMemory(id: string): Promise<void> {
  let memories = (await get<MemoryItem[]>(MEMORY_STORE_KEY)) || [];
  memories = memories.filter(m => m.id !== id);
  await set(MEMORY_STORE_KEY, memories);
}

export async function clearMemories(): Promise<void> {
  await set(MEMORY_STORE_KEY, []);
}
