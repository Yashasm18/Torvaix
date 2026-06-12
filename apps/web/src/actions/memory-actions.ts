"use server";

import { MemoryStore } from '@torvaix/memory';
import path from 'path';

// Instantiate the memory store
// Use a robust path for the db depending on environment. For now, local torvaix.db in root.
const dbPath = path.resolve(process.cwd(), '../../torvaix.db');
const memoryStore = new MemoryStore(dbPath);
memoryStore.initQdrant();

export async function storeMemoryAction(workspaceId: string, content: string, source: string) {
  try {
    const id = await memoryStore.storeMemory(workspaceId, content, source);
    return { success: true, id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function queryMemoryAction(workspaceId: string, query: string, topK: number = 5) {
  try {
    const results = await memoryStore.queryMemory(workspaceId, query, topK);
    return { success: true, results };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getAllMemoriesAction(workspaceId: string) {
  try {
    const results = await memoryStore.getAllMemories(workspaceId);
    return { success: true, results };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteMemoryAction(id: string) {
  try {
    await memoryStore.deleteMemory(id);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateMemoryAction(id: string, newContent: string) {
  try {
    await memoryStore.updateMemory(id, newContent);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getSystemStatusAction() {
  const status = { ollama: false, qdrant: false, sqlite: false };
  try {
    // Check SQLite
    await memoryStore.getAllMemories('test');
    status.sqlite = true;
  } catch (e) {}

  try {
    // Check Qdrant
    const res = await fetch('http://localhost:6333');
    if (res.ok) status.qdrant = true;
  } catch (e) {}

  try {
    // Check Ollama
    const res = await fetch('http://localhost:11434');
    if (res.ok) status.ollama = true;
  } catch (e) {}

  return status;
}
