/**
 * Tests for Torvaix Memory Store
 *
 * Tests SQLite operations, workspace management, and the embedding fallback chain.
 * Note: Qdrant and Ollama integration tests require those services to be running.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryStore } from '../index';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('MemoryStore — SQLite Operations', () => {
  let dbPath: string;
  let store: MemoryStore;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `torvaix-test-${Date.now()}.db`);
    store = new MemoryStore(dbPath, {
      ollamaUrl: 'http://localhost:11434', // will fail gracefully
      qdrantUrl: 'http://localhost:6333',  // will fail gracefully
    });
  });

  afterEach(() => {
    try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
  });

  it('creates default workspace', () => {
    const ws = store.getWorkspace('default');
    expect(ws).toBeDefined();
    expect(ws!.name).toBe('Default Workspace');
  });

  it('creates and retrieves workspaces', () => {
    const id = store.createWorkspace('Test Workspace', { theme: 'dark' });
    expect(id).toBeDefined();
    expect(id.length).toBeGreaterThan(0);

    const ws = store.getWorkspace(id);
    expect(ws).toBeDefined();
    expect(ws!.name).toBe('Test Workspace');

    const settings = JSON.parse(ws!.settings);
    expect(settings.theme).toBe('dark');
  });

  it('lists workspaces', () => {
    store.createWorkspace('Workspace A');
    store.createWorkspace('Workspace B');
    const list = store.listWorkspaces();
    expect(list.length).toBeGreaterThanOrEqual(3); // default + 2
  });

  it('stores and queries memories (SQLite fallback)', async () => {
    const wsId = store.createWorkspace('Memory Test');
    const memId = await store.storeMemory(wsId, 'My favorite language is TypeScript', 'test');
    expect(memId).toBeDefined();

    const results = await store.queryMemory(wsId, 'favorite language', 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain('TypeScript');
  });

  it('queries memories across multiple stored items', async () => {
    const wsId = store.createWorkspace('Multi Memory Test');
    await store.storeMemory(wsId, 'I love React for frontend development', 'test');
    await store.storeMemory(wsId, 'My favorite backend framework is Express', 'test');
    await store.storeMemory(wsId, 'I use Python for data science projects', 'test');

    const results = await store.queryMemory(wsId, 'favorite backend', 5);
    expect(results.length).toBeGreaterThan(0);
    // Should find the Express entry
    const expressResult = results.find(r => r.content.includes('Express'));
    expect(expressResult).toBeDefined();
  });

  it('returns empty array for no matches', async () => {
    const wsId = store.createWorkspace('Empty Test');
    const results = await store.queryMemory(wsId, 'something that does not exist anywhere', 5);
    expect(Array.isArray(results)).toBe(true);
  });

  it('updates memory content', async () => {
    const wsId = store.createWorkspace('Update Test');
    const id = await store.storeMemory(wsId, 'Original content', 'test');
    await store.updateMemory(id, 'Updated content');

    const all = await store.getAllMemories(wsId);
    const updated = (all as any[]).find((m: any) => m.id === id);
    expect(updated.content).toBe('Updated content');
  });

  it('deletes memory', async () => {
    const wsId = store.createWorkspace('Delete Test');
    const id = await store.storeMemory(wsId, 'To be deleted', 'test');
    await store.deleteMemory(id);

    const mem = await store.getMemoryById(id);
    expect(mem).toBeUndefined();
  });

  it('throws on updating nonexistent memory', async () => {
    await expect(store.updateMemory('nonexistent-id', 'test'))
      .rejects.toThrow('Memory with ID nonexistent-id not found');
  });

  it('creates and lists conversations', () => {
    const wsId = store.createWorkspace('Conv Test');
    const conv1 = store.createConversation(wsId, 'First Chat');
    const conv2 = store.createConversation(wsId, 'Second Chat');

    expect(conv1).toBeDefined();
    expect(conv2).toBeDefined();

    const convs = store.listConversations(wsId);
    expect(convs.length).toBe(2);
  });
});

describe('MemoryStore — Pending Actions', () => {
  let dbPath: string;
  let store: MemoryStore;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `torvaix-test-actions-${Date.now()}.db`);
    store = new MemoryStore(dbPath);
  });

  afterEach(() => {
    try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
  });

  it('creates and retrieves pending actions', () => {
    const wsId = store.createWorkspace('Action Test');
    const id = store.createPendingAction(wsId, 'bash', { command: 'ls' });
    expect(id).toBeDefined();

    const action = store.getPendingAction(id);
    expect(action).toBeDefined();
    expect(action!.action).toBe('bash');
    expect(action!.status).toBe('pending');
  });

  it('updates pending action status', () => {
    const wsId = store.createWorkspace('Status Test');
    const id = store.createPendingAction(wsId, 'python', { code: 'print(1)' });

    store.updatePendingActionStatus(id, 'approved');
    const approved = store.getPendingAction(id);
    expect(approved!.status).toBe('approved');

    store.updatePendingActionStatus(id, 'rejected');
    const rejected = store.getPendingAction(id);
    expect(rejected!.status).toBe('rejected');
  });
});

describe('MemoryStore — Users (Auth)', () => {
  let dbPath: string;
  let store: MemoryStore;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `torvaix-test-users-${Date.now()}.db`);
    store = new MemoryStore(dbPath);
  });

  afterEach(() => {
    try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
  });

  it('creates and retrieves users', () => {
    const id = store.createUser('testuser', 'test@example.com', 'hashedpassword123');
    expect(id).toBeDefined();

    const user = store.getUserByEmail('test@example.com');
    expect(user).toBeDefined();
    expect(user!.username).toBe('testuser');
    expect(user!.passwordHash).toBe('hashedpassword123');
  });

  it('finds user by ID', () => {
    const id = store.createUser('byid', 'byid@example.com', 'hash');
    const user = store.getUserById(id);
    expect(user).toBeDefined();
    expect(user!.username).toBe('byid');
  });

  it('returns undefined for nonexistent user', () => {
    expect(store.getUserByEmail('nobody@example.com')).toBeUndefined();
    expect(store.getUserById('nonexistent')).toBeUndefined();
  });

  it('enforces unique email constraint', () => {
    store.createUser('user1', 'dup@example.com', 'hash1');
    expect(() => {
      store.createUser('user2', 'dup@example.com', 'hash2');
    }).toThrow();
  });
});

describe('MemoryStore — Local Embedding', () => {
  let dbPath: string;
  let store: MemoryStore;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `torvaix-test-embed-${Date.now()}.db`);
    store = new MemoryStore(dbPath, {
      ollamaUrl: 'http://invalid:99999', // force fallback
    });
  });

  afterEach(() => {
    try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
  });

  it('falls back to local keyword embedding', async () => {
    const embedding = await store.generateEmbedding('test query about artificial intelligence');
    expect(embedding).not.toBeNull();
    expect(embedding!.length).toBe(768);

    // Should be normalized (unit vector)
    const mag = Math.sqrt(embedding!.reduce((s, v) => s + v * v, 0));
    expect(Math.abs(mag - 1.0)).toBeLessThan(0.01);
  });

  it('produces consistent embeddings for same text', async () => {
    const e1 = await store.generateEmbedding('hello world');
    const e2 = await store.generateEmbedding('hello world');
    expect(e1).not.toBeNull();
    expect(e2).not.toBeNull();
    for (let i = 0; i < e1!.length; i++) {
      expect(e1![i]).toBe(e2![i]);
    }
  });

  it('produces different embeddings for different text', async () => {
    const e1 = await store.generateEmbedding('hello world');
    const e2 = await store.generateEmbedding('completely different text');
    expect(e1).not.toBeNull();
    expect(e2).not.toBeNull();

    let different = false;
    for (let i = 0; i < e1!.length; i++) {
      if (e1![i] !== e2![i]) { different = true; break; }
    }
    expect(different).toBe(true);
  });
});
