import { describe, it, expect, vi, beforeEach } from 'vitest';

const callTool = vi.fn(async (tool: string, args: any) => ({ content: [{ type: 'text', text: `ran ${tool} ${JSON.stringify(args)}` }] }));
vi.mock('@torvaix/mcp', () => ({ getMcpClient: () => ({ callTool }) }));

import { MemoryStore, type AgentRunRecord } from '@torvaix/memory';
import { AgentOrchestrator } from '../orchestrator';
import { createAgentRuns, type ResumeResult } from '../agent-runs';
import { LIMITS, type AgentFields } from '../validation';

const DONE = '{"done": true, "message": "finished"}';
const BASH = '{"done": false, "tool": "bash", "args": {"command": "echo hi"}}';
const WRITE = '{"done": false, "tool": "write_file", "args": {"filePath": "a.txt", "content": "x"}}';

/** An LLM that returns the scripted replies in order, then says it is done. Tests can add more replies later. */
function scriptedLlm(replies: string[]) {
  return {
    replies,
    complete: vi.fn(async () => ({ text: replies.shift() ?? DONE })),
    getDefaultModel: () => 'test-model',
  } as any;
}

const promptOf = (llm: any, call: number): string => llm.complete.mock.calls[call][1].map((m: { content: string }) => m.content).join('\n');

function setup(replies: string[] = []) {
  const store = new MemoryStore(':memory:', { qdrantUrl: 'http://127.0.0.1:1' });
  const llm = scriptedLlm(replies);
  const events = { emitAgentStarted: vi.fn(), emitAgentFinished: vi.fn() };
  const agentRuns = createAgentRuns({
    store,
    events,
    newOrchestrator: persona => new AgentOrchestrator(store, { llm, model: 'test-model', persona }),
  });
  const agent = store.createAgent({
    workspaceId: 'default',
    name: 'Shell helper',
    description: 'Runs commands',
    instructions: 'Run the commands the user asks for.',
    tools: ['bash', 'read_file', 'write_file'],
  });
  return { store, llm, events, agentRuns, agent };
}

/** The run a resume returned, failing the test when it returned an error instead. */
function runOf(result: ResumeResult): AgentRunRecord {
  if (!('run' in result)) throw new Error(`Expected a run, got ${result.status}: ${result.error}`);
  return result.run;
}

const announced = { announce: true };

beforeEach(() => {
  callTool.mockReset();
  callTool.mockImplementation(async (tool: string, args: any) => ({ content: [{ type: 'text', text: `ran ${tool} ${JSON.stringify(args)}` }] }));
});

describe('starting a run', () => {
  it('ends completed with the model\'s answer, and is listed for the agent', async () => {
    const { agentRuns, agent, store } = setup(['{"done": true, "message": "Tidied."}']);

    const run = await agentRuns.startRun(agent, 'Tidy the notes', announced);

    expect(run).toMatchObject({ agentId: agent.id, workspaceId: 'default', task: 'Tidy the notes', status: 'completed', output: 'Tidied.', pendingActionId: null });
    expect(store.listAgentRuns(agent.id)).toEqual([run]);
    expect(store.getAgentRun(run.id)?.status).toBe('completed');
  });

  it('saves the run as unfinished before the model answers, and updates that same row at the end', async () => {
    const { agentRuns, agent, store, llm } = setup();
    let whileRunning: AgentRunRecord[] = [];
    llm.complete.mockImplementationOnce(async () => {
      whileRunning = store.listAgentRuns(agent.id);
      return { text: DONE };
    });

    const run = await agentRuns.startRun(agent, 'Do it', announced);

    expect(whileRunning).toHaveLength(1);
    expect(whileRunning[0]).toMatchObject({ id: run.id, status: 'error', output: 'The run did not finish.' });
    expect(store.listAgentRuns(agent.id)).toHaveLength(1);
    expect(store.getAgentRun(run.id)).toMatchObject({ status: 'completed', output: 'finished' });
  });

  it('announces a run that the user started, and not one an automation started', async () => {
    const user = setup();
    await user.agentRuns.startRun(user.agent, 'Do it', announced);
    expect(user.events.emitAgentStarted).toHaveBeenCalledWith({ agentId: user.agent.id, workspaceId: 'default', task: 'Do it' });
    expect(user.events.emitAgentFinished).toHaveBeenCalledWith({ agentId: user.agent.id, workspaceId: 'default', task: 'Do it', status: 'completed', result: 'finished' });

    const automation = setup();
    await automation.agentRuns.startRun(automation.agent, 'Do it', { announce: false });
    expect(automation.events.emitAgentStarted).not.toHaveBeenCalled();
    expect(automation.events.emitAgentFinished).not.toHaveBeenCalled();
  });

  it('pauses for a shell command with exactly one pending action, and runs nothing yet', async () => {
    const { agentRuns, agent, store } = setup([BASH]);

    const run = await agentRuns.startRun(agent, 'Say hi', announced);

    expect(run.status).toBe('awaiting_approval');
    expect(run.output).toBe('Waiting for your approval to run a shell command.');
    expect(run.pendingActionId).toBeTruthy();
    const actions = store.listPendingActions('default');
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ id: run.pendingActionId, action: 'bash', status: 'pending' });
    expect(JSON.parse(actions[0].params)).toEqual({ command: 'echo hi' });
    expect(callTool).not.toHaveBeenCalled();
    expect(store.getAgentRun(run.id)).toMatchObject({ status: 'awaiting_approval', pendingActionId: run.pendingActionId });
  });

  it('says Python when the command is Python code', async () => {
    const { agentRuns, agent, store } = setup(['{"done": false, "tool": "python", "args": {"code": "print(1)"}}']);
    store.updateAgent(agent.id, { tools: ['python'] });

    const run = await agentRuns.startRun(store.getAgent(agent.id)!, 'Print one', announced);

    expect(run.output).toBe('Waiting for your approval to run Python code.');
  });

  it('turns a model that fails into a run with status error, saved as such', async () => {
    const { agentRuns, agent, store, llm } = setup();
    llm.complete.mockRejectedValueOnce(new Error('model is down'));

    const run = await agentRuns.startRun(agent, 'Do it', announced);

    expect(run).toMatchObject({ status: 'error', output: 'LLM Error: model is down' });
    expect(store.getAgentRun(run.id)).toMatchObject({ status: 'error', output: 'LLM Error: model is down' });
  });

  it('turns an orchestrator that throws into a run with status error, not a throw', async () => {
    const { store, events, agent } = setup();
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const agentRuns = createAgentRuns({ store, events, newOrchestrator: () => ({ run: async () => { throw new Error('boom'); } }) });

    const run = await agentRuns.startRun(agent, 'Do it', announced);
    quiet.mockRestore();

    expect(run).toMatchObject({ status: 'error', output: 'The agent could not run: boom' });
    expect(store.getAgentRun(run.id)?.output).toBe('The agent could not run: boom');
  });

  it('saves a run that was stopped as cancelled, with the output "Stopped."', async () => {
    const { agentRuns, agent, store, llm, events } = setup();
    const cancel = new AbortController();
    // The user presses Stop while the model is still deciding what to do.
    llm.complete.mockImplementationOnce(async () => {
      cancel.abort();
      return { text: WRITE };
    });

    const run = await agentRuns.startRun(agent, 'Write a file', { signal: cancel.signal, announce: true });

    expect(run).toMatchObject({ status: 'cancelled', output: 'Stopped.', pendingActionId: null });
    expect(store.getAgentRun(run.id)).toMatchObject({ status: 'cancelled', output: 'Stopped.' });
    expect(callTool).not.toHaveBeenCalled();
    expect(events.emitAgentStarted).toHaveBeenCalledTimes(1);
    expect(events.emitAgentFinished).not.toHaveBeenCalled();
  });

  it('adds up the time of a run across the pauses', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const { agentRuns, agent, store, llm } = setup([BASH]);
      const delays = [1000, 500];
      llm.complete.mockImplementation(async () => {
        vi.advanceTimersByTime(delays.shift() ?? 0);
        return { text: llm.replies.shift() ?? DONE };
      });

      const paused = await agentRuns.startRun(agent, 'Say hi', announced);
      expect(paused.durationMs).toBe(1000);
      store.updatePendingActionStatus(paused.pendingActionId!, 'approved');

      const resumed = runOf(await agentRuns.resumeRun(paused.pendingActionId!, announced));

      expect(resumed.id).toBe(paused.id);
      expect(resumed.durationMs).toBe(1500);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('carrying on after an approval', () => {
  /** A run that has written a file and then stopped to ask about a shell command. */
  async function pausedRun() {
    const ctx = setup([WRITE, BASH]);
    const paused = await ctx.agentRuns.startRun(ctx.agent, 'Write a file and show it', announced);
    return { ...ctx, paused, pendingId: paused.pendingActionId! };
  }

  it('answers "approve or deny the command first" while the command waits, and changes nothing', async () => {
    const { agentRuns, agent, store, llm, paused, pendingId } = await pausedRun();
    const modelCalls = llm.complete.mock.calls.length;
    const before = store.getAgentRun(paused.id);

    const result = await agentRuns.resumeRun(pendingId, { ...announced, agentId: agent.id });

    expect(result).toEqual({ status: 409, error: 'Approve or deny the command first' });
    expect(llm.complete.mock.calls.length).toBe(modelCalls);
    expect(store.getAgentRun(paused.id)).toEqual(before);
    expect(store.listPendingActions('default')).toHaveLength(1);
    expect(store.getPendingAction(pendingId)?.status).toBe('pending');
    expect(callTool).not.toHaveBeenCalledWith('bash', expect.anything());
  });

  it('runs the approved command once, in the same run, with the history from before the pause', async () => {
    const { agentRuns, agent, store, llm, events, paused, pendingId } = await pausedRun();
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(callTool).toHaveBeenCalledWith('write_file', { filePath: 'a.txt', content: 'x' });
    store.updatePendingActionStatus(pendingId, 'approved');
    llm.replies.push('{"done": true, "message": "It printed hi."}');
    const modelCallsBefore = llm.complete.mock.calls.length;

    const run = runOf(await agentRuns.resumeRun(pendingId, { ...announced, agentId: agent.id }));

    expect(run).toMatchObject({ id: paused.id, task: paused.task, status: 'completed', output: 'It printed hi.', pendingActionId: null });
    expect(callTool.mock.calls.filter(([tool]) => tool === 'bash')).toEqual([['bash', { command: 'echo hi' }]]);
    expect(store.getPendingAction(pendingId)?.status).toBe('executed');
    expect(store.listAgentRuns(agent.id)).toHaveLength(1);
    // The file that was written before the pause is still in what the model sees.
    expect(promptOf(llm, modelCallsBefore)).toContain('Tool write_file Result: ran write_file');
    expect(promptOf(llm, modelCallsBefore)).toContain('Tool bash Result: ran bash {"command":"echo hi"}');
    // Resuming is announced like starting, as the same agent.
    expect(events.emitAgentStarted).toHaveBeenLastCalledWith({ agentId: agent.id, workspaceId: 'default', task: 'Write a file and show it' });
    expect(events.emitAgentFinished).toHaveBeenLastCalledWith(expect.objectContaining({ agentId: agent.id, status: 'completed', result: 'It printed hi.' }));
  });

  it('carries on without being told which agent, for the Tasks page', async () => {
    const { agentRuns, store, paused, pendingId } = await pausedRun();
    store.updatePendingActionStatus(pendingId, 'approved');

    const run = runOf(await agentRuns.resumeRun(pendingId, announced));

    expect(run).toMatchObject({ id: paused.id, status: 'completed' });
    expect(callTool.mock.calls.filter(([tool]) => tool === 'bash')).toHaveLength(1);
  });

  it('pauses again when the agent wants another command, and that one needs its own approval', async () => {
    const { agentRuns, store, llm, paused, pendingId } = await pausedRun();
    store.updatePendingActionStatus(pendingId, 'approved');
    llm.replies.push('{"done": false, "tool": "bash", "args": {"command": "echo again"}}');

    const run = runOf(await agentRuns.resumeRun(pendingId, announced));

    expect(run).toMatchObject({ id: paused.id, status: 'awaiting_approval' });
    expect(run.pendingActionId).toBeTruthy();
    expect(run.pendingActionId).not.toBe(pendingId);
    expect(store.getPendingAction(run.pendingActionId!)?.status).toBe('pending');
    expect(callTool.mock.calls.filter(([tool]) => tool === 'bash')).toHaveLength(1);
  });

  it('answers 404 when the same approval is used a second time', async () => {
    const { agentRuns, agent, store, llm, pendingId } = await pausedRun();
    store.updatePendingActionStatus(pendingId, 'approved');
    await agentRuns.resumeRun(pendingId, { ...announced, agentId: agent.id });
    const modelCalls = llm.complete.mock.calls.length;

    const again = await agentRuns.resumeRun(pendingId, { ...announced, agentId: agent.id });

    expect(again).toEqual({ status: 404, error: 'No run of this agent is waiting for that approval' });
    expect(llm.complete.mock.calls.length).toBe(modelCalls);
    expect(callTool.mock.calls.filter(([tool]) => tool === 'bash')).toHaveLength(1);
  });

  it('answers 404 for another agent, and leaves the approval for the right one', async () => {
    const { agentRuns, agent, store, paused, pendingId } = await pausedRun();
    const other = store.createAgent({ workspaceId: 'default', name: 'Other', instructions: 'Other.', tools: ['bash'] });
    store.updatePendingActionStatus(pendingId, 'approved');
    const before = store.getAgentRun(paused.id);

    const result = await agentRuns.resumeRun(pendingId, { ...announced, agentId: other.id });

    expect(result).toMatchObject({ status: 404 });
    expect(store.getAgentRun(paused.id)).toEqual(before);
    expect(store.getPendingAction(pendingId)?.status).toBe('approved');
    expect(callTool.mock.calls.filter(([tool]) => tool === 'bash')).toHaveLength(0);
    expect(runOf(await agentRuns.resumeRun(pendingId, { ...announced, agentId: agent.id })).status).toBe('completed');
  });

  it('answers 404 for an approval no run is waiting on', async () => {
    const { agentRuns, store } = setup();
    const lonely = store.createPendingAction('default', 'bash', { command: 'ls' });
    store.updatePendingActionStatus(lonely, 'approved');

    expect(await agentRuns.resumeRun(lonely, announced)).toMatchObject({ status: 404 });
    expect(await agentRuns.resumeRun('no-such-action', announced)).toMatchObject({ status: 404 });
    expect(store.getPendingAction(lonely)?.status).toBe('approved');
  });

  it('answers 409 to a second request while the run is being worked on, and runs the command once', async () => {
    const { agentRuns, agent, store, llm, pendingId } = await pausedRun();
    store.updatePendingActionStatus(pendingId, 'approved');
    let release!: () => void;
    const gate = new Promise<{ text: string }>(resolve => { release = () => resolve({ text: DONE }); });
    llm.complete.mockImplementationOnce(() => gate);
    const modelCalls = llm.complete.mock.calls.length;

    const first = agentRuns.resumeRun(pendingId, { ...announced, agentId: agent.id });
    await vi.waitFor(() => expect(llm.complete.mock.calls.length).toBe(modelCalls + 1));
    const second = await agentRuns.resumeRun(pendingId, { ...announced, agentId: agent.id });
    const third = await agentRuns.resumeRun(pendingId, announced);
    release();
    const finished = runOf(await first);

    expect(second).toEqual({ status: 409, error: 'This run is already in progress' });
    expect(third).toEqual({ status: 409, error: 'This run is already in progress' });
    expect(finished.status).toBe('completed');
    expect(callTool.mock.calls.filter(([tool]) => tool === 'bash')).toHaveLength(1);
  });

  it('can be worked on again once the earlier work is over', async () => {
    const { agentRuns, store, llm, pendingId } = await pausedRun();
    store.updatePendingActionStatus(pendingId, 'approved');
    llm.replies.push('{"done": false, "tool": "bash", "args": {"command": "echo again"}}');
    const second = runOf(await agentRuns.resumeRun(pendingId, announced));
    store.updatePendingActionStatus(second.pendingActionId!, 'approved');

    const third = await agentRuns.resumeRun(second.pendingActionId!, announced);

    expect(runOf(third).status).toBe('completed');
  });

  it('saves a resumed run that was stopped as cancelled, and leaves the approval unclaimed', async () => {
    const { agentRuns, store, paused, pendingId } = await pausedRun();
    store.updatePendingActionStatus(pendingId, 'approved');
    const cancel = new AbortController();
    cancel.abort();

    const run = runOf(await agentRuns.resumeRun(pendingId, { signal: cancel.signal, announce: true }));

    expect(run).toMatchObject({ id: paused.id, status: 'cancelled', output: 'Stopped.', pendingActionId: null });
    expect(store.getPendingAction(pendingId)?.status).toBe('approved');
    expect(callTool.mock.calls.filter(([tool]) => tool === 'bash')).toHaveLength(0);
  });
});

describe('a denied command', () => {
  async function pausedRun() {
    const ctx = setup([BASH]);
    const paused = await ctx.agentRuns.startRun(ctx.agent, 'Say hi', announced);
    return { ...ctx, paused, pendingId: paused.pendingActionId! };
  }

  it('closes the run as cancelled when the denial is settled, and nothing runs', async () => {
    const { agentRuns, store, llm, paused, pendingId } = await pausedRun();
    const modelCalls = llm.complete.mock.calls.length;
    store.updatePendingActionStatus(pendingId, 'rejected');

    const run = agentRuns.settleDecision(pendingId, 'rejected');

    expect(run).toMatchObject({ id: paused.id, status: 'cancelled', output: 'You denied the command, so nothing was run.', pendingActionId: null });
    expect(run).not.toHaveProperty('context');
    expect(store.getAgentRun(paused.id)).toMatchObject({ status: 'cancelled', output: 'You denied the command, so nothing was run.', pendingActionId: null });
    expect(callTool).not.toHaveBeenCalled();
    expect(llm.complete.mock.calls.length).toBe(modelCalls);
    expect(store.getPendingAction(pendingId)?.status).toBe('rejected');
  });

  it('does nothing for an approval, or for a command no run is waiting on', async () => {
    const { agentRuns, store, paused, pendingId } = await pausedRun();
    const lonely = store.createPendingAction('default', 'bash', { command: 'ls' });
    store.updatePendingActionStatus(lonely, 'rejected');

    expect(agentRuns.settleDecision(pendingId, 'approved')).toBeNull();
    expect(agentRuns.settleDecision(lonely, 'rejected')).toBeNull();
    expect(agentRuns.settleDecision('no-such-action', 'rejected')).toBeNull();
    expect(store.getAgentRun(paused.id)).toMatchObject({ status: 'awaiting_approval', pendingActionId: pendingId });
  });

  it('closes the run the same way when it is resumed after a denial, without calling the model', async () => {
    const { agentRuns, agent, store, llm, paused, pendingId } = await pausedRun();
    store.updatePendingActionStatus(pendingId, 'rejected');
    const modelCalls = llm.complete.mock.calls.length;

    const run = runOf(await agentRuns.resumeRun(pendingId, { ...announced, agentId: agent.id }));

    expect(run).toMatchObject({ id: paused.id, status: 'cancelled', output: 'You denied the command, so nothing was run.', pendingActionId: null });
    expect(run).not.toHaveProperty('context');
    expect(store.getAgentRun(paused.id)?.status).toBe('cancelled');
    expect(llm.complete.mock.calls.length).toBe(modelCalls);
    expect(callTool).not.toHaveBeenCalled();
    // The run is closed, so the same approval id leads nowhere any more.
    expect(await agentRuns.resumeRun(pendingId, { ...announced, agentId: agent.id })).toMatchObject({ status: 404 });
  });
});

describe('a command that was settled some other way', () => {
  async function pausedRun() {
    const ctx = setup([BASH]);
    const paused = await ctx.agentRuns.startRun(ctx.agent, 'Say hi', announced);
    return { ...ctx, paused, pendingId: paused.pendingActionId! };
  }

  it('closes the run as completed when the command was already run elsewhere, without running anything', async () => {
    const { agentRuns, store, llm, paused, pendingId } = await pausedRun();
    store.updatePendingActionStatus(pendingId, 'approved');
    store.consumeApprovedAction(pendingId, 'default'); // run by a chat, say
    const modelCalls = llm.complete.mock.calls.length;

    const run = runOf(await agentRuns.resumeRun(pendingId, announced));

    expect(run).toMatchObject({ id: paused.id, status: 'completed', output: 'The command was approved and run outside this agent run.', pendingActionId: null });
    expect(run).not.toHaveProperty('context');
    expect(store.getAgentRun(paused.id)?.status).toBe('completed');
    expect(llm.complete.mock.calls.length).toBe(modelCalls);
    expect(callTool).not.toHaveBeenCalled();
  });

  it('closes the run as an error when the command no longer exists', async () => {
    const { agentRuns, store, llm, paused, pendingId } = await pausedRun();
    (store as any).db.prepare('DELETE FROM pending_actions WHERE id = ?').run(pendingId);
    const modelCalls = llm.complete.mock.calls.length;

    const run = runOf(await agentRuns.resumeRun(pendingId, announced));

    expect(run).toMatchObject({ id: paused.id, status: 'error', pendingActionId: null });
    expect(run.output).toBe('The command this run was waiting for no longer exists, so nothing was run.');
    expect(store.getAgentRun(paused.id)?.status).toBe('error');
    expect(llm.complete.mock.calls.length).toBe(modelCalls);
    expect(callTool).not.toHaveBeenCalled();
  });
});

describe('what clients get back', () => {
  it('never includes the stored history, whichever way the run ends', async () => {
    const { agentRuns, agent, store, llm } = setup([WRITE, BASH]);
    const results: AgentRunRecord[] = [];

    const paused = await agentRuns.startRun(agent, 'Write and show', announced);
    results.push(paused);
    store.updatePendingActionStatus(paused.pendingActionId!, 'approved');
    results.push(runOf(await agentRuns.resumeRun(paused.pendingActionId!, announced)));
    results.push(await agentRuns.startRun(agent, 'Again', announced));
    llm.replies.push(BASH);
    const second = await agentRuns.startRun(agent, 'And again', announced);
    results.push(second);
    store.updatePendingActionStatus(second.pendingActionId!, 'rejected');
    results.push(agentRuns.settleDecision(second.pendingActionId!, 'rejected')!);

    expect(results).toHaveLength(5);
    for (const run of results) expect(run).not.toHaveProperty('context');
  });

  it('never includes it when the agent was deleted while a new run was going', async () => {
    const { agentRuns, agent, store, llm } = setup();
    llm.complete.mockImplementationOnce(async () => {
      store.deleteAgent(agent.id);
      return { text: DONE };
    });

    const run = await agentRuns.startRun(agent, 'Do it', announced);

    expect(run).toMatchObject({ status: 'completed', output: 'finished' });
    expect(run).not.toHaveProperty('context');
    expect(store.getAgentRun(run.id)).toBeNull();
  });

  it('never includes it when the agent was deleted while a resumed run was going', async () => {
    const { agentRuns, agent, store, llm } = setup([WRITE, BASH]);
    const paused = await agentRuns.startRun(agent, 'Write and show', announced);
    store.updatePendingActionStatus(paused.pendingActionId!, 'approved');
    llm.complete.mockImplementationOnce(async () => {
      store.deleteAgent(agent.id);
      return { text: DONE };
    });

    const run = runOf(await agentRuns.resumeRun(paused.pendingActionId!, announced));

    expect(run).toMatchObject({ id: paused.id, status: 'completed', output: 'finished' });
    expect(run).not.toHaveProperty('context');
  });

  it('shapes a run for the Tasks page: waiting for approval is pending_confirmation, anything else is completed', () => {
    const { agentRuns, agent } = setup();
    const run = (status: AgentRunRecord['status'], pendingActionId: string | null): AgentRunRecord => ({
      id: 'run-1', agentId: agent.id, workspaceId: 'default', task: 'Say hi', status, output: 'Some output', pendingActionId, durationMs: 5, createdAt: '2030-01-01T00:00:00.000Z',
    });

    expect(agentRuns.taskOfRun(run('awaiting_approval', 'p-1'), 'high')).toEqual({
      id: 'run-1', workspaceId: 'default', instructions: 'Say hi', priority: 'high', status: 'pending_confirmation', output: 'Some output', pendingActionId: 'p-1',
    });
    for (const status of ['completed', 'error', 'cancelled'] as const) {
      expect(agentRuns.taskOfRun(run(status, null), 'medium')).toMatchObject({ status: 'completed', pendingActionId: null });
    }
  });

  it('says whether a run is waiting on a command', async () => {
    const { agentRuns, agent } = setup([BASH]);
    const paused = await agentRuns.startRun(agent, 'Say hi', announced);

    expect(agentRuns.hasWaitingRun(paused.pendingActionId!)).toBe(true);
    expect(agentRuns.hasWaitingRun('no-such-action')).toBe(false);
  });
});

describe('choosing an agent', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('gives the agent for its own workspace', () => {
    expect(ctx.agentRuns.resolveAgentForWorkspace(ctx.agent.id, 'default')).toEqual(ctx.agent);
  });

  it('gives null for another workspace, an unknown id, and an id that is not text', () => {
    expect(ctx.agentRuns.resolveAgentForWorkspace(ctx.agent.id, 'elsewhere')).toBeNull();
    expect(ctx.agentRuns.resolveAgentForWorkspace('no-such-agent', 'default')).toBeNull();
    for (const notText of [42, null, undefined, {}, [ctx.agent.id], true]) {
      expect(ctx.agentRuns.resolveAgentForWorkspace(notText, 'default')).toBeNull();
    }
  });

  it('describes an agent to the orchestrator by its name, instructions and tools', () => {
    expect(ctx.agentRuns.personaOf(ctx.agent)).toEqual({ name: 'Shell helper', instructions: 'Run the commands the user asks for.', tools: ['bash', 'read_file', 'write_file'] });
  });
});

describe('the limit on agents', () => {
  const fields = (name: string): AgentFields => ({ name, description: '', instructions: 'Do the task.', tools: ['read_file'] });
  const fill = (store: MemoryStore, workspaceId: string, count: number) => {
    for (let i = 0; i < count; i++) store.createAgent({ workspaceId, name: `Agent ${i}`, instructions: 'x', tools: [] });
  };

  it('allows the 50th agent and refuses the 51st', () => {
    const { agentRuns, store } = setup();
    fill(store, 'busy', LIMITS.agentsPerWorkspace - 1);

    const fiftieth = agentRuns.createAgentWithinLimit('busy', fields('Fiftieth'));
    const fiftyFirst = agentRuns.createAgentWithinLimit('busy', fields('Fifty-first'));

    expect(LIMITS.agentsPerWorkspace).toBe(50);
    expect(fiftieth).toMatchObject({ agent: { name: 'Fiftieth', workspaceId: 'busy', tools: ['read_file'] } });
    expect(fiftyFirst).toEqual({ error: 'A workspace can have at most 50 agents. Delete one to add another.' });
    expect(store.countAgents('busy')).toBe(50);
  });

  it('does not count the agents of another workspace', () => {
    const { agentRuns, store } = setup();
    fill(store, 'busy', LIMITS.agentsPerWorkspace);

    const created = agentRuns.createAgentWithinLimit('quiet', fields('First here'));

    expect(created).toMatchObject({ agent: { name: 'First here', workspaceId: 'quiet' } });
    expect(store.countAgents('quiet')).toBe(1);
  });
});
