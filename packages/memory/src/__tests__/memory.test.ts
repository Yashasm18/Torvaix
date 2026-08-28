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

  it('lists pending actions filtered by workspace and status', () => {
    const wsId = store.createWorkspace('List Action Test');
    const id1 = store.createPendingAction(wsId, 'bash', { command: 'echo 1' });
    const id2 = store.createPendingAction(wsId, 'bash', { command: 'echo 2' });
    store.updatePendingActionStatus(id1, 'approved');

    const allActions = store.listPendingActions(wsId);
    expect(allActions.length).toBe(2);

    const pendingOnly = store.listPendingActions(wsId, 'pending');
    expect(pendingOnly.length).toBe(1);
    expect(pendingOnly[0].id).toBe(id2);
  });

  it('logs and lists execution logs', () => {
    const wsId = store.createWorkspace('Exec Log Test');
    store.logExecution(wsId, 'bash', { command: 'ls -la' }, 'file1\nfile2', 'success');
    store.logExecution(wsId, 'python', { code: '1/0' }, 'ZeroDivisionError', 'error');

    const logs = store.listExecutionLogs(wsId);
    expect(logs.length).toBe(2);
    expect(logs[0].action).toBe('python');
    expect(logs[0].status).toBe('error');
    expect(logs[1].action).toBe('bash');
    expect(logs[1].status).toBe('success');
  });

  it('computes memory stats for a workspace', async () => {
    const wsId = store.createWorkspace('Stats Test');
    await store.storeMemory(wsId, 'Memory 1', 'test');
    await store.storeMemory(wsId, 'Memory 2', 'test');

    const stats = store.getMemoryStats(wsId);
    expect(stats.total).toBe(2);
    expect(stats.oldest).toBeDefined();
    expect(stats.newest).toBeDefined();
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

describe('MemoryStore — Hybrid Retrieval & RRF', () => {
  let dbPath: string;
  let store: MemoryStore;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `torvaix-test-rrf-${Date.now()}.db`);
    store = new MemoryStore(dbPath, {
      ollamaUrl: 'http://127.0.0.1:59999',
      qdrantUrl: 'http://127.0.0.1:59999',
    });
  });

  afterEach(() => {
    try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
  });

  it('performs Reciprocal Rank Fusion correctly', () => {
    const vectorResults = [
      { id: 'doc-1', content: 'TypeScript backend architecture', source: 'test', score: 0.9 },
      { id: 'doc-2', content: 'React frontend layout', source: 'test', score: 0.8 },
    ];

    const keywordResults = [
      { id: 'doc-3', content: 'SQLite FTS5 keyword indexing', source: 'test', score: 0.85 },
      { id: 'doc-1', content: 'TypeScript backend architecture', source: 'test', score: 0.75 },
    ];

    const fused = store.reciprocalRankFusion(vectorResults, keywordResults, 5);
    expect(fused.length).toBe(3);

    // doc-1 appeared in both vector and keyword results, so it should be ranked highest as hybrid_rrf
    expect(fused[0].id).toBe('doc-1');
    expect(fused[0].retrievalType).toBe('hybrid_rrf');
    expect(fused[0].score).toBe(1.0); // max normalized score

    // doc-2 was vector-only, doc-3 was keyword-only
    const doc2 = fused.find(r => r.id === 'doc-2');
    const doc3 = fused.find(r => r.id === 'doc-3');
    expect(doc2?.retrievalType).toBe('vector');
    expect(doc3?.retrievalType).toBe('keyword');
  });

  it('queries memories with keyword search and tagging', async () => {
    const wsId = store.createWorkspace('RRF Test');
    await store.storeMemory(wsId, 'Qdrant vector embeddings database', 'test');
    await store.storeMemory(wsId, 'SQLite relational storage engine', 'test');

    const results = await store.queryMemory(wsId, 'vector embeddings', 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].retrievalType).toBeDefined();
    expect(results[0].content).toContain('Qdrant');
  });
});

describe('MemoryStore — Automation Workflows & Logs', () => {
  let store: MemoryStore;
  let testDbPath: string;

  beforeEach(() => {
    testDbPath = path.join(os.tmpdir(), `torvaix-auto-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    store = new MemoryStore(testDbPath);
  });

  afterEach(() => {
    try { fs.unlinkSync(testDbPath); } catch { /* ignore */ }
  });

  it('creates, lists, updates, and deletes automation workflows', () => {
    const wsId = store.createWorkspace('Auto WS');

    const created = store.createAutomation({
      workspaceId: wsId,
      name: 'Nightly Sync',
      description: 'Sync files every night',
      triggerType: 'schedule',
      triggerConfig: { frequency: 'daily', timeOfDay: '03:00' },
      actionType: 'agent_task',
      actionConfig: { prompt: 'Sync files' },
      status: 'active'
    });

    expect(created.id).toBeDefined();
    expect(created.name).toBe('Nightly Sync');
    expect(created.status).toBe('active');

    const list = store.listAutomations(wsId);
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(created.id);

    const updated = store.updateAutomation(created.id, {
      status: 'paused',
      name: 'Nightly Sync (Paused)'
    });
    expect(updated).toBe(true);

    const fetched = store.getAutomation(created.id);
    expect(fetched?.status).toBe('paused');
    expect(fetched?.name).toBe('Nightly Sync (Paused)');

    const deleted = store.deleteAutomation(created.id);
    expect(deleted).toBe(true);
    expect(store.listAutomations(wsId).length).toBe(0);
  });

  it('records execution logs and calculates automation stats', () => {
    const wsId = store.createWorkspace('Stats WS');
    const auto = store.createAutomation({
      workspaceId: wsId,
      name: 'Auto Runner',
      triggerType: 'manual',
      actionType: 'consolidate_memory',
      status: 'active'
    });

    store.logAutomationRun({
      automationId: auto.id,
      workspaceId: wsId,
      status: 'success',
      output: 'Consolidation complete: 3 insights',
      durationMs: 245,
      startedAt: new Date().toISOString()
    });

    store.logAutomationRun({
      automationId: auto.id,
      workspaceId: wsId,
      status: 'error',
      output: 'Network timeout',
      durationMs: 500,
      startedAt: new Date().toISOString()
    });

    const logs = store.listAutomationLogs(auto.id);
    expect(logs.length).toBe(2);
    expect(logs[0].output).toBeDefined();

    const stats = store.getAutomationStats(wsId);
    expect(stats.totalAutomations).toBe(1);
    expect(stats.activeCount).toBe(1);
    expect(stats.successfulRuns).toBe(1);
    expect(stats.failedRuns).toBe(1);
  });

  it('seeds default automations when workspace is empty', () => {
    const wsId = store.createWorkspace('Seed WS');
    expect(store.listAutomations(wsId).length).toBe(0);

    store.seedDefaultAutomations(wsId);
    const seeded = store.listAutomations(wsId);
    expect(seeded.length).toBe(3);
    expect(seeded.some(s => s.name.includes('Consolidation'))).toBe(true);
    expect(seeded.some(s => s.name.includes('Graph Indexer'))).toBe(true);
  });
});


