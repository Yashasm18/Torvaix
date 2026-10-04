/**
 * Tests for Torvaix Memory Store
 *
 * Tests SQLite operations, workspace management, and the embedding fallback chain.
 * Note: Qdrant and Ollama integration tests require those services to be running.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryStore, extractKeywords, toConfigJson } from '../index';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('MemoryStore — SQLite Operations', () => {
  let dbPath: string;
  let store: MemoryStore;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `torvaix-test-${Date.now()}.db`);
    store = new MemoryStore(dbPath, {
      ollamaUrl: 'http://127.0.0.1:1', // unreachable: never touch the user's real services
      qdrantUrl: 'http://127.0.0.1:1',
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

    expect(store.updatePendingActionStatus(id, 'approved')).toBe(true);
    expect(store.getPendingAction(id)!.status).toBe('approved');

    // A decision is final: an approved action can't be flipped (or re-approved) later.
    expect(store.updatePendingActionStatus(id, 'rejected')).toBe(false);
    expect(store.getPendingAction(id)!.status).toBe('approved');
  });

  it('claims an approved action exactly once, only in its own workspace', () => {
    const wsId = store.createWorkspace('Consume Test');
    const otherWs = store.createWorkspace('Other Workspace');
    const id = store.createPendingAction(wsId, 'bash', { command: 'ls' });

    expect(store.consumeApprovedAction(id, wsId)).toBeUndefined(); // still pending

    store.updatePendingActionStatus(id, 'approved');
    expect(store.consumeApprovedAction(id, otherWs)).toBeUndefined(); // wrong workspace

    const claimed = store.consumeApprovedAction(id, wsId);
    expect(claimed?.status).toBe('executed');
    expect(store.consumeApprovedAction(id, wsId)).toBeUndefined(); // no replay
  });

  it('never lets a rejected action be claimed', () => {
    const wsId = store.createWorkspace('Reject Test');
    const id = store.createPendingAction(wsId, 'python', { code: 'print(1)' });
    store.updatePendingActionStatus(id, 'rejected');
    expect(store.updatePendingActionStatus(id, 'approved')).toBe(false);
    expect(store.consumeApprovedAction(id, wsId)).toBeUndefined();
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

  it('provisions and saves a folder for workspaces created without one', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'torvaix-home-'));
    const prev = process.env.TORVAIX_HOME;
    process.env.TORVAIX_HOME = home;
    try {
      const p = store.ensureWorkspacePath('default');
      expect(p.startsWith(path.join(home, 'workspaces'))).toBe(true);
      expect(fs.existsSync(path.join(p, 'tasks'))).toBe(true);
      expect(JSON.parse(store.getWorkspace('default')!.settings).path).toBe(p);
      expect(store.ensureWorkspacePath('default')).toBe(p);

      const root = path.join(home, 'workspaces') + path.sep;

      // Client-supplied paths and traversal ids can't move the folder out of the root.
      const hostile = store.createWorkspace('Hostile', { path: '/etc' }, '../../zz');
      const created = JSON.parse(store.getWorkspace(hostile)!.settings).path;
      expect(created.startsWith(root)).toBe(true);

      // A bad path already saved in the DB (older versions) is replaced, not used.
      (store as any).db.prepare('UPDATE workspaces SET settings = ? WHERE id = ?').run(JSON.stringify({ path: '/etc' }), hostile);
      const safe = store.ensureWorkspacePath(hostile);
      expect(safe.startsWith(root)).toBe(true);
      expect(JSON.parse(store.getWorkspace(hostile)!.settings).path).toBe(safe);
    } finally {
      if (prev === undefined) delete process.env.TORVAIX_HOME;
      else process.env.TORVAIX_HOME = prev;
      fs.rmSync(home, { recursive: true, force: true });
    }
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

  it('keeps exactly one FTS row per memory across store re-initialisation', async () => {
    const wsId = store.createWorkspace('FTS Dedupe');
    await store.storeMemory(wsId, 'PostgreSQL is my favorite database', 'test');
    await store.storeMemory(wsId, 'Redis is a fast cache', 'test');

    // Every server, agent loop, and web action constructs its own MemoryStore on the same DB.
    for (let i = 0; i < 3; i++) {
      new MemoryStore(dbPath, { ollamaUrl: 'http://127.0.0.1:59999', qdrantUrl: 'http://127.0.0.1:59999' });
    }

    const db = (store as any).db;
    const ftsRows = (db.prepare('SELECT COUNT(*) as c FROM memories_fts').get() as { c: number }).c;
    const memRows = (db.prepare('SELECT COUNT(*) as c FROM memories').get() as { c: number }).c;
    expect(ftsRows).toBe(memRows);

    const results = store.performKeywordSearch(wsId, 'PostgreSQL database', 10);
    const ids = results.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('repairs an FTS index that already contains duplicate rows', async () => {
    const wsId = store.createWorkspace('FTS Repair');
    await store.storeMemory(wsId, 'Qdrant stores vectors', 'test');

    const db = (store as any).db;
    db.exec(`INSERT INTO memories_fts(id, workspaceId, content) SELECT id, workspaceId, content FROM memories`);
    db.exec(`INSERT INTO memories_fts(id, workspaceId, content) SELECT id, workspaceId, content FROM memories`);

    new MemoryStore(dbPath, { ollamaUrl: 'http://127.0.0.1:59999', qdrantUrl: 'http://127.0.0.1:59999' });

    const ftsRows = (db.prepare('SELECT COUNT(*) as c FROM memories_fts').get() as { c: number }).c;
    expect(ftsRows).toBe(1);
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
    expect(seeded.map(s => s.name).sort()).toEqual(['Daily research digest', 'Keep the knowledge graph up to date', 'Weekly memory themes']);
    // The example agent task must not start running by itself.
    expect(seeded.find(s => s.name === 'Daily research digest')?.status).toBe('paused');
  });

  it('renames untouched legacy default automations and leaves edited ones alone', () => {
    const wsId = store.createWorkspace('Legacy WS');
    const untouched = store.createAutomation({
      workspaceId: wsId,
      name: 'Autonomous Memory Consolidation',
      description: 'Review recent conversation memories, deduplicate, and strengthen important connections in the knowledge graph.',
      triggerType: 'manual', triggerConfig: {}, actionType: 'consolidate_memory', actionConfig: {}, status: 'active',
    });
    const edited = store.createAutomation({
      workspaceId: wsId,
      name: 'Workspace Knowledge Graph Indexer',
      description: 'My own description',
      triggerType: 'manual', triggerConfig: {}, actionType: 'synthesize_graph', actionConfig: {}, status: 'active',
    });

    store.seedDefaultAutomations(wsId); // workspace isn't empty: only the rename runs

    expect(store.listAutomations(wsId).length).toBe(2);
    expect(store.getAutomation(untouched.id)?.name).toBe('Weekly memory themes');
    expect(store.getAutomation(untouched.id)?.description).toMatch(/doesn't change anything/);
    expect(store.getAutomation(edited.id)?.name).toBe('Workspace Knowledge Graph Indexer');
    expect(store.getAutomation(edited.id)?.description).toBe('My own description');
  });
});



describe('MemoryStore — Search relevance & companion pairing', () => {
  let dbPath: string;
  let store: MemoryStore;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `torvaix-test-relevance-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    store = new MemoryStore(dbPath, { ollamaUrl: 'http://127.0.0.1:59999', qdrantUrl: 'http://127.0.0.1:59999' });
  });

  afterEach(() => {
    try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
  });

  it('extracts Unicode keywords and drops filler words', () => {
    expect(extractKeywords('What is my favorite database?')).toEqual(['favorite', 'database']);
    expect(extractKeywords('Café crème, café!')).toEqual(['café', 'crème']);
    expect(extractKeywords('ನನ್ನ ನೆಚ್ಚಿನ ಭಾಷೆ')).toHaveLength(3);
    expect(extractKeywords('?? 🙂 hi')).toEqual([]);
  });

  it('finds memories written in non-Latin scripts', async () => {
    const ws = store.createWorkspace('Unicode');
    await store.storeMemory(ws, 'ನನ್ನ ನೆಚ್ಚಿನ ಭಾಷೆ ಕನ್ನಡ', 'test');
    const results = store.performKeywordSearch(ws, 'ನೆಚ್ಚಿನ ಭಾಷೆ', 5);
    expect(results[0]?.content).toContain('ಕನ್ನಡ');
  });

  it('returns nothing for queries without meaningful keywords instead of the latest memories', async () => {
    const ws = store.createWorkspace('No Keywords');
    await store.storeMemory(ws, 'PostgreSQL is my production database', 'test');
    expect(store.performKeywordSearch(ws, 'hi there?', 5)).toEqual([]);
    expect(store.performKeywordSearch(ws, '🙂', 5)).toEqual([]);
  });

  it('scores by keyword coverage so weak matches stay below the relevance threshold', async () => {
    const ws = store.createWorkspace('Scores');
    await store.storeMemory(ws, 'My favorite language is TypeScript', 'test');
    expect(store.performKeywordSearch(ws, 'favorite language', 5)[0].score).toBe(1);
    expect(store.performKeywordSearch(ws, 'favorite pizza topping', 5)[0].score).toBeLessThan(0.4);
  });

  it('claims pairing tokens once and never hands an existing device to a new token', () => {
    const admin = store.createPairingToken('admin');
    expect(store.claimPairingToken(admin.token, 'Laptop', 'fp-1')).toBeTruthy();
    expect(store.claimPairingToken(admin.token, 'Other', 'fp-2')).toBeNull(); // already claimed

    const readonly = store.createPairingToken('readonly');
    expect(store.claimPairingToken(readonly.token, 'Attacker', 'fp-1')).toBeNull(); // no takeover of the admin device
    expect(store.claimPairingToken(readonly.token, 'Phone', 'fp-3')).toBeTruthy(); // failed attempt didn't burn the token
  });
});

describe('memory events carry their workspace', () => {
  it('includes workspaceId on update and delete, and emits nothing for a missing memory', async () => {
    const { eventBus } = await import('@torvaix/events');
    const store = new MemoryStore(':memory:', { ollamaUrl: 'http://127.0.0.1:1', qdrantUrl: 'http://127.0.0.1:1' });
    const seen: [string, unknown][] = [];
    const onUpdated = (p: unknown) => seen.push(['MEMORY_UPDATED', p]);
    const onDeleted = (p: unknown) => seen.push(['MEMORY_DELETED', p]);
    eventBus.on('MEMORY_UPDATED', onUpdated);
    eventBus.on('MEMORY_DELETED', onDeleted);
    try {
      const id = await store.storeMemory('ws-events', 'Tea over coffee', 'test');
      await store.updateMemory(id, 'Coffee over tea');
      await store.deleteMemory(id);
      await store.deleteMemory('does-not-exist');

      expect(seen).toEqual([
        ['MEMORY_UPDATED', { id, workspaceId: 'ws-events', newContent: 'Coffee over tea' }],
        ['MEMORY_DELETED', { id, workspaceId: 'ws-events' }],
      ]);
    } finally {
      eventBus.off('MEMORY_UPDATED', onUpdated);
      eventBus.off('MEMORY_DELETED', onDeleted);
    }
  });
});

describe('workspaces the server has not seen yet', () => {
  it('accepts tool approvals, logs, automations and conversations for them', () => {
    // The web app creates workspaces in the browser; one made while the agent was offline has no
    // row here. These writes used to fail with "FOREIGN KEY constraint failed".
    const store = new MemoryStore(':memory:', { qdrantUrl: 'http://127.0.0.1:1' });
    const ws = 'made-while-offline';

    const pendingId = store.createPendingAction(ws, 'bash', { command: 'ls' });
    store.logExecution(ws, 'read_file', { filePath: 'a.txt' }, 'ok', 'success');
    store.createConversation(ws, 'First chat');
    store.seedDefaultAutomations(ws);

    expect(store.getPendingAction(pendingId)?.workspaceId).toBe(ws);
    expect(store.listExecutionLogs(ws)).toHaveLength(1);
    expect(store.listAutomations(ws)).toHaveLength(3);
    expect(store.getWorkspace(ws)).toBeTruthy();
  });

  it('gives them a tool folder that stays the same between runs', () => {
    const store = new MemoryStore(':memory:', { qdrantUrl: 'http://127.0.0.1:1' });
    const first = store.ensureWorkspacePath('made-while-offline-2');
    expect(store.ensureWorkspacePath('made-while-offline-2')).toBe(first);
    expect(JSON.parse(store.getWorkspace('made-while-offline-2')!.settings).path).toBe(first);
  });
});

describe('automation settings are always stored as JSON objects', () => {
  it('turns strings, lists and broken JSON into an empty object', () => {
    expect(toConfigJson({ frequency: 'daily' })).toBe('{"frequency":"daily"}');
    expect(toConfigJson('{"frequency":"daily"}')).toBe('{"frequency":"daily"}');
    for (const bad of ['not json', '"text"', '[1,2]', [1, 2], 5, null, undefined]) {
      expect(toConfigJson(bad)).toBe('{}');
    }
  });

  it('never saves settings that cannot be read back', () => {
    const store = new MemoryStore(':memory:', { qdrantUrl: 'http://127.0.0.1:1' });
    const created = store.createAutomation({
      workspaceId: 'default', name: 'bad', triggerType: 'manual', actionType: 'consolidate_memory',
      triggerConfig: 'not json', actionConfig: 'oops',
    });
    expect(JSON.parse(created.triggerConfig)).toEqual({});
    expect(JSON.parse(created.actionConfig)).toEqual({});

    store.updateAutomation(created.id, { triggerConfig: 'still not json', actionConfig: ['x'] });
    const updated = store.getAutomation(created.id)!;
    expect(JSON.parse(updated.triggerConfig)).toEqual({});
    expect(JSON.parse(updated.actionConfig)).toEqual({});
  });

  it('repairs rows saved by an earlier version when the database is opened', () => {
    const dbPath = path.join(os.tmpdir(), `torvaix-repair-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    try {
      const first = new MemoryStore(dbPath, { qdrantUrl: 'http://127.0.0.1:1' });
      const { id } = first.createAutomation({ workspaceId: 'default', name: 'old', triggerType: 'manual', actionType: 'consolidate_memory' });
      (first as any).db.prepare("UPDATE automations SET triggerConfig = 'not json', actionConfig = 'oops' WHERE id = ?").run(id);
      first.close();

      const reopened = new MemoryStore(dbPath, { qdrantUrl: 'http://127.0.0.1:1' });
      const row = reopened.getAutomation(id)!;
      expect(row.triggerConfig).toBe('{}');
      expect(row.actionConfig).toBe('{}');
      reopened.close();
    } finally {
      for (const suffix of ['', '-wal', '-shm']) { try { fs.unlinkSync(dbPath + suffix); } catch { /* ignore */ } }
    }
  });
});
