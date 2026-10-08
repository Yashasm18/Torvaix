import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { MemoryStore } from '../index';

const newStore = () => new MemoryStore(':memory:', { ollamaUrl: 'http://127.0.0.1:1', qdrantUrl: 'http://127.0.0.1:1' });

const sample = (workspaceId: string, name = 'Notes helper') => ({
  workspaceId,
  name,
  description: 'Keeps notes tidy',
  instructions: 'Tidy the notes the user gives you.',
  tools: ['read_file', 'write_file'],
});

describe('agents', () => {
  let store: MemoryStore;
  beforeEach(() => {
    store = newStore();
  });

  it('creates an agent and reads it back', () => {
    const created = store.createAgent(sample('default'));

    expect(created).toMatchObject({
      workspaceId: 'default',
      name: 'Notes helper',
      description: 'Keeps notes tidy',
      instructions: 'Tidy the notes the user gives you.',
      tools: ['read_file', 'write_file'],
      runCount: 0,
      lastRunAt: null,
    });
    expect(created.id).toBeTruthy();
    expect(new Date(created.createdAt).toISOString()).toBe(created.createdAt);
    expect(created.updatedAt).toBe(created.createdAt);
    expect(store.getAgent(created.id)).toEqual(created);
    expect(store.getAgent('missing')).toBeNull();
  });

  it('lists only the workspace\'s agents, in the order they were made, with run counts', () => {
    const first = store.createAgent(sample('default', 'First'));
    const second = store.createAgent(sample('default', 'Second'));
    store.createAgent(sample('elsewhere', 'Other workspace'));

    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2031-01-01T10:00:00.000Z'));
      store.createAgentRun({ agentId: first.id, workspaceId: 'default', task: 'a', status: 'completed' });
      vi.setSystemTime(new Date('2031-01-02T10:00:00.000Z'));
      store.createAgentRun({ agentId: first.id, workspaceId: 'default', task: 'b', status: 'error' });
    } finally {
      vi.useRealTimers();
    }

    const agents = store.listAgents('default');
    expect(agents.map(a => a.name)).toEqual(['First', 'Second']);
    expect(agents[0]).toMatchObject({ id: first.id, runCount: 2, lastRunAt: '2031-01-02T10:00:00.000Z' });
    expect(agents[1]).toMatchObject({ id: second.id, runCount: 0, lastRunAt: null });
    expect(store.countAgents('default')).toBe(2);
    expect(store.countAgents('elsewhere')).toBe(1);
    expect(store.countAgents('nobody')).toBe(0);
  });

  it('changes only the fields it is given and records when', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2032-05-01T00:00:00.000Z'));
      const agent = store.createAgent(sample('default'));
      vi.setSystemTime(new Date('2032-05-02T00:00:00.000Z'));

      const updated = store.updateAgent(agent.id, { name: 'Renamed', tools: ['web_search'] });
      expect(updated).toMatchObject({
        name: 'Renamed',
        tools: ['web_search'],
        description: 'Keeps notes tidy',
        instructions: 'Tidy the notes the user gives you.',
        createdAt: '2032-05-01T00:00:00.000Z',
        updatedAt: '2032-05-02T00:00:00.000Z',
      });

      // An empty list of tools is a real choice, not "leave it as it was".
      expect(store.updateAgent(agent.id, { tools: [] })?.tools).toEqual([]);
      expect(store.updateAgent('missing', { name: 'x' })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('deletes an agent together with its runs, and nobody else\'s', () => {
    const doomed = store.createAgent(sample('default', 'Doomed'));
    const kept = store.createAgent(sample('default', 'Kept'));
    const doomedRun = store.createAgentRun({ agentId: doomed.id, workspaceId: 'default', task: 't', status: 'completed' });
    const keptRun = store.createAgentRun({ agentId: kept.id, workspaceId: 'default', task: 't', status: 'completed' });

    expect(store.deleteAgent(doomed.id)).toBe(true);

    expect(store.getAgent(doomed.id)).toBeNull();
    expect(store.getAgentRun(doomedRun.id)).toBeNull();
    expect(store.listAgentRuns(doomed.id)).toEqual([]);
    expect(store.getAgent(kept.id)).not.toBeNull();
    expect(store.getAgentRun(keptRun.id)).not.toBeNull();
    expect(store.deleteAgent(doomed.id)).toBe(false);
  });

  it('works in a workspace the store has no record of yet', () => {
    const agent = store.createAgent(sample('made-in-the-browser'));
    const run = store.createAgentRun({ agentId: agent.id, workspaceId: 'made-in-the-browser', task: 't', status: 'completed' });

    expect(store.listAgents('made-in-the-browser')).toHaveLength(1);
    expect(store.getWorkspace('made-in-the-browser')).toBeDefined();
    expect(run.agentId).toBe(agent.id);
  });

  it('upgrades a database made before agents existed', () => {
    const file = path.join(os.tmpdir(), `torvaix-agents-upgrade-${process.pid}-${Date.now()}.db`);
    try {
      const old = new Database(file);
      old.exec("CREATE TABLE workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, settings TEXT NOT NULL DEFAULT '{}', createdAt DATETIME DEFAULT CURRENT_TIMESTAMP)");
      old.close();

      const upgraded = new MemoryStore(file, { ollamaUrl: 'http://127.0.0.1:1', qdrantUrl: 'http://127.0.0.1:1' });
      upgraded.createAgent(sample('default'));
      expect(upgraded.listAgents('default')).toHaveLength(1);
      upgraded.close();

      // Opening it again keeps what was saved.
      const again = new MemoryStore(file, { ollamaUrl: 'http://127.0.0.1:1', qdrantUrl: 'http://127.0.0.1:1' });
      expect(again.listAgents('default')).toHaveLength(1);
      again.close();
    } finally {
      for (const suffix of ['', '-wal', '-shm']) fs.rmSync(file + suffix, { force: true });
    }
  });
});

describe('starter agents', () => {
  let store: MemoryStore;
  beforeEach(() => {
    store = newStore();
  });

  it('creates three starters the first time a workspace is seeded', () => {
    store.seedDefaultAgents('default');

    const agents = store.listAgents('default');
    expect(agents.map(a => a.name)).toEqual(['Researcher', 'File assistant', 'Shell helper']);
    expect(agents[0].tools).toEqual(['web_search']);
    expect(agents[1].tools).toEqual(['read_file', 'write_file', 'repo_scan']);
    expect(agents[2].tools).toEqual(['bash', 'python', 'read_file', 'write_file']);
    expect(agents.every(a => a.instructions.length > 20 && a.description.length > 0)).toBe(true);
  });

  it('seeds once: a second call adds nothing', () => {
    store.seedDefaultAgents('default');
    store.seedDefaultAgents('default');

    expect(store.countAgents('default')).toBe(3);
  });

  it('does not bring back a starter the user deleted', () => {
    store.seedDefaultAgents('default');
    const [researcher] = store.listAgents('default');
    store.deleteAgent(researcher.id);

    store.seedDefaultAgents('default');

    expect(store.listAgents('default').map(a => a.name)).toEqual(['File assistant', 'Shell helper']);
  });

  it('does not bring them back after the user deleted all of them', () => {
    store.seedDefaultAgents('default');
    for (const agent of store.listAgents('default')) store.deleteAgent(agent.id);

    store.seedDefaultAgents('default');

    expect(store.countAgents('default')).toBe(0);
  });

  it('seeds each workspace separately and keeps the workspace\'s other settings', () => {
    const id = store.createWorkspace('Project', { theme: 'dark' });
    const folder = JSON.parse(store.getWorkspace(id)!.settings).path;

    store.seedDefaultAgents(id);
    store.seedDefaultAgents('default');

    expect(store.countAgents(id)).toBe(3);
    expect(store.countAgents('default')).toBe(3);
    expect(JSON.parse(store.getWorkspace(id)!.settings)).toEqual({ theme: 'dark', path: folder, agentsSeeded: true });
  });

  it('seeds a workspace the store has no record of yet', () => {
    store.seedDefaultAgents('made-in-the-browser');

    expect(store.countAgents('made-in-the-browser')).toBe(3);
    expect(JSON.parse(store.getWorkspace('made-in-the-browser')!.settings).agentsSeeded).toBe(true);
  });

  it('keeps the seeded flag when the workspace folder is provisioned later', () => {
    store.seedDefaultAgents('later');
    store.ensureWorkspacePath('later');
    store.seedDefaultAgents('later');

    expect(store.countAgents('later')).toBe(3);
  });
});

describe('agent runs', () => {
  let store: MemoryStore;
  let agentId: string;
  beforeEach(() => {
    store = newStore();
    agentId = store.createAgent(sample('default')).id;
  });

  it('records a run and reads it back without its history', () => {
    const run = store.createAgentRun({
      agentId,
      workspaceId: 'default',
      task: 'Tidy notes.md',
      status: 'awaiting_approval',
      output: 'Waiting',
      pendingActionId: 'pending-1',
      context: [{ role: 'system', content: 'earlier step' }],
      durationMs: 1234.6,
    });

    expect(run).toMatchObject({ agentId, workspaceId: 'default', task: 'Tidy notes.md', status: 'awaiting_approval', output: 'Waiting', pendingActionId: 'pending-1', durationMs: 1235 });
    expect(new Date(run.createdAt).toISOString()).toBe(run.createdAt);
    expect(run).not.toHaveProperty('context');
    expect(store.getAgentRun(run.id)).toMatchObject({ id: run.id, context: [{ role: 'system', content: 'earlier step' }] });
  });

  it('finds the run that waits for an approval, and stops finding it once the run moves on', () => {
    const run = store.createAgentRun({ agentId, workspaceId: 'default', task: 't', status: 'awaiting_approval', pendingActionId: 'pending-1', context: [{ role: 'system', content: 'step one' }] });
    store.createAgentRun({ agentId, workspaceId: 'default', task: 'other', status: 'awaiting_approval', pendingActionId: 'pending-2' });

    const found = store.getAgentRunByPendingAction('pending-1');
    expect(found?.id).toBe(run.id);
    expect(found?.context).toEqual([{ role: 'system', content: 'step one' }]);
    expect(store.getAgentRunByPendingAction('nope')).toBeNull();

    // Resuming updates the same run; its old approval id no longer points at it.
    const updated = store.updateAgentRun(run.id, { status: 'completed', output: 'done', pendingActionId: null, durationMs: 50 });
    expect(updated).toMatchObject({ id: run.id, status: 'completed', output: 'done', pendingActionId: null, durationMs: 50, task: 't' });
    expect(store.getAgentRunByPendingAction('pending-1')).toBeNull();
    expect(store.getAgentRunByPendingAction('pending-2')).not.toBeNull();
    expect(store.listAgentRuns(agentId)).toHaveLength(2);
  });

  it('records a run that was cancelled, and stops finding it by its approval', () => {
    const run = store.createAgentRun({ agentId, workspaceId: 'default', task: 't', status: 'awaiting_approval', pendingActionId: 'pending-1' });

    const cancelled = store.updateAgentRun(run.id, { status: 'cancelled', output: 'You denied the command, so nothing was run.', pendingActionId: null });

    expect(cancelled).toMatchObject({ id: run.id, status: 'cancelled', output: 'You denied the command, so nothing was run.', pendingActionId: null });
    expect(store.getAgentRun(run.id)?.status).toBe('cancelled');
    expect(store.listAgentRuns(agentId)[0].status).toBe('cancelled');
    expect(store.getAgentRunByPendingAction('pending-1')).toBeNull();
  });

  it('leaves what it is not told to change, history included', () => {
    const run = store.createAgentRun({ agentId, workspaceId: 'default', task: 't', status: 'awaiting_approval', output: 'Waiting', pendingActionId: 'p', context: [{ role: 'system', content: 'kept' }] });

    store.updateAgentRun(run.id, { durationMs: 10 });

    expect(store.getAgentRun(run.id)).toMatchObject({ output: 'Waiting', pendingActionId: 'p', status: 'awaiting_approval', context: [{ role: 'system', content: 'kept' }], durationMs: 10 });
  });

  it('says so when the run to update is gone', () => {
    expect(store.updateAgentRun('missing', { status: 'completed' })).toBeNull();
    expect(store.getAgentRun('missing')).toBeNull();
  });

  it('lists runs newest first and honours the limit', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      for (const [i, task] of ['one', 'two', 'three'].entries()) {
        vi.setSystemTime(new Date(`2033-01-0${i + 1}T00:00:00.000Z`));
        store.createAgentRun({ agentId, workspaceId: 'default', task, status: 'completed' });
      }
    } finally {
      vi.useRealTimers();
    }
    const other = store.createAgent(sample('default', 'Other'));
    store.createAgentRun({ agentId: other.id, workspaceId: 'default', task: 'not mine', status: 'completed' });

    expect(store.listAgentRuns(agentId).map(r => r.task)).toEqual(['three', 'two', 'one']);
    expect(store.listAgentRuns(agentId, 2).map(r => r.task)).toEqual(['three', 'two']);
    expect(store.listAgentRuns(agentId)[0]).not.toHaveProperty('context');
  });

  it('orders runs made in the same millisecond by when they were saved', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2034-01-01T00:00:00.000Z'));
      for (const task of ['first', 'second', 'third']) store.createAgentRun({ agentId, workspaceId: 'default', task, status: 'completed' });
    } finally {
      vi.useRealTimers();
    }

    expect(store.listAgentRuns(agentId).map(r => r.task)).toEqual(['third', 'second', 'first']);
  });

  it('keeps only the most recent part of a long history', () => {
    const context = Array.from({ length: 100 }, (_, i) => ({ role: 'system' as const, content: `${String(i).padStart(3, '0')}:${'x'.repeat(996)}` }));
    const run = store.createAgentRun({ agentId, workspaceId: 'default', task: 't', status: 'awaiting_approval', pendingActionId: 'p', context });

    const kept = store.getAgentRun(run.id)!.context;
    const chars = kept.reduce((sum, m) => sum + m.content.length, 0);
    expect(chars).toBeLessThanOrEqual(40_000);
    expect(kept.length).toBeGreaterThan(30);
    expect(kept.length).toBeLessThan(100);
    expect(kept[kept.length - 1].content.startsWith('099:')).toBe(true);
    // What is kept is one unbroken run of the newest messages.
    expect(kept.map(m => Number(m.content.slice(0, 3)))).toEqual(Array.from({ length: kept.length }, (_, i) => 100 - kept.length + i));

    store.updateAgentRun(run.id, { context });
    expect(store.getAgentRun(run.id)!.context).toHaveLength(kept.length);
  });

  it('shortens a single message that is longer than the whole budget', () => {
    const run = store.createAgentRun({ agentId, workspaceId: 'default', task: 't', status: 'completed', context: [{ role: 'system', content: 'y'.repeat(90_000) }] });

    const kept = store.getAgentRun(run.id)!.context;
    expect(kept).toHaveLength(1);
    expect(kept[0].content.length).toBe(40_000);
  });

  it('reads a damaged history as empty instead of failing', () => {
    const run = store.createAgentRun({ agentId, workspaceId: 'default', task: 't', status: 'completed' });
    (store as any).db.prepare('UPDATE agent_runs SET context = ? WHERE id = ?').run('not json', run.id);

    expect(store.getAgentRun(run.id)!.context).toEqual([]);
  });
});
