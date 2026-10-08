/**
 * Runs of the user's custom agents: starting one, carrying on after an approval, and closing a
 * run whose command was denied. This lives apart from server.ts because that file starts
 * listening as soon as it is imported, so nothing in it can be tested.
 */

import type { MemoryStore, AgentRecord, AgentRunRecord, AgentRunStatus, AgentContextMessage } from '@torvaix/memory';
import type { torvaixEvents } from '@torvaix/events';
import type { AgentOrchestrator, AgentPersona } from './orchestrator';
import { LIMITS, type AgentFields } from './validation';

export interface AgentRunDeps {
  store: MemoryStore;
  /** Builds the orchestrator for one run, working as the given agent. */
  newOrchestrator: (persona: AgentPersona) => Pick<AgentOrchestrator, 'run'>;
  events: Pick<typeof torvaixEvents, 'emitAgentStarted' | 'emitAgentFinished'>;
}

export interface RunOptions {
  /** Aborted when the client goes away. The run is then saved as cancelled. */
  signal?: AbortSignal;
  /** Automations don't announce their runs: a workflow that reacts to those events could trigger itself. */
  announce: boolean;
}

export type ResumeResult = { run: AgentRunRecord } | { status: 404 | 409; error: string };

const NO_RUN_WAITING = 'No run of this agent is waiting for that approval';
const ALREADY_RUNNING = 'This run is already in progress';
const DECIDE_FIRST = 'Approve or deny the command first';
const STOPPED = 'Stopped.';
const DENIED = 'You denied the command, so nothing was run.';
const RUN_ELSEWHERE = 'The command was approved and run outside this agent run.';
const ACTION_GONE = 'The command this run was waiting for no longer exists, so nothing was run.';

export const personaOf = (agent: AgentRecord): AgentPersona => ({
  name: agent.name,
  instructions: agent.instructions,
  tools: agent.tools,
});

/** A run as clients see it: never with the history it keeps for continuing after an approval. */
function withoutHistory(run: AgentRunRecord): AgentRunRecord {
  const { context: _history, ...plain } = run as AgentRunRecord & { context?: unknown };
  return plain;
}

export function createAgentRuns({ store, newOrchestrator, events }: AgentRunDeps) {
  /** Runs being worked on right now. Stops one approval from resuming the same run twice at once. */
  const active = new Set<string>();

  async function whileActive(runId: string, work: () => Promise<AgentRunRecord>): Promise<AgentRunRecord> {
    active.add(runId);
    try {
      return await work();
    } finally {
      active.delete(runId);
    }
  }

  /** What a paused run says. The command itself is loaded from the pending action, not from this text. */
  function approvalWaitText(pendingActionId: string): string {
    const tool = store.getPendingAction(pendingActionId)?.action;
    return `Waiting for your approval to run ${tool === 'python' ? 'Python code' : 'a shell command'}.`;
  }

  /** Ends a run without calling the model. */
  function closeRun(run: AgentRunRecord, status: AgentRunStatus, output: string): AgentRunRecord {
    return store.updateAgentRun(run.id, { status, output, pendingActionId: null })
      ?? withoutHistory({ ...run, status, output, pendingActionId: null });
  }

  /**
   * Runs an agent on a task, or carries on with a run that was waiting for an approval, and saves
   * how it ended on `run`. A failure is a run with status "error", never a throw.
   */
  async function execute(opts: RunOptions & {
    agent: AgentRecord;
    run: AgentRunRecord;
    task: string;
    /** The history of a run that is being resumed; empty for a new one. */
    messages: AgentContextMessage[];
    pendingActionId?: string;
  }): Promise<AgentRunRecord> {
    const { agent, run, task, signal } = opts;
    const started = Date.now();
    if (opts.announce) events.emitAgentStarted({ agentId: agent.id, workspaceId: agent.workspaceId, task });

    let status: AgentRunStatus;
    let output: string;
    let pendingActionId: string | null = null;
    let context = opts.messages;
    try {
      const finalState = await newOrchestrator(personaOf(agent)).run(
        {
          workspaceId: agent.workspaceId,
          instructions: task,
          messages: opts.messages,
          pendingActionId: opts.pendingActionId,
          nextNode: 'execution',
        },
        undefined,
        { signal }
      );
      context = finalState.messages;
      if (signal?.aborted) {
        status = 'cancelled';
        output = STOPPED;
      } else if (finalState.pendingActionId) {
        status = 'awaiting_approval';
        pendingActionId = finalState.pendingActionId;
        output = approvalWaitText(pendingActionId);
      } else {
        status = finalState.error ? 'error' : 'completed';
        output = String(finalState.output ?? '');
      }
    } catch (error: any) {
      console.error('[Agents] Run failed:', error);
      status = 'error';
      output = `The agent could not run: ${error?.message ?? error}`;
    }

    const durationMs = run.durationMs + (Date.now() - started);
    // Null when the agent was deleted while it ran; the caller still gets the result.
    const saved = store.updateAgentRun(run.id, { status, output, pendingActionId, context, durationMs })
      ?? withoutHistory({ ...run, status, output, pendingActionId, durationMs });

    if (opts.announce && !signal?.aborted) {
      events.emitAgentFinished({
        agentId: agent.id,
        workspaceId: agent.workspaceId,
        task,
        status: status === 'awaiting_approval' ? 'awaiting_approval' : 'completed',
        result: output,
      });
    }
    return saved;
  }

  /** The agent for a chat or an automation: null unless `agentId` is the id of an agent in this workspace. */
  function resolveAgentForWorkspace(agentId: unknown, workspaceId: string): AgentRecord | null {
    const agent = typeof agentId === 'string' ? store.getAgent(agentId) : null;
    return agent && agent.workspaceId === workspaceId ? agent : null;
  }

  function createAgentWithinLimit(workspaceId: string, fields: AgentFields): { agent: AgentRecord } | { error: string } {
    if (store.countAgents(workspaceId) >= LIMITS.agentsPerWorkspace) {
      return { error: `A workspace can have at most ${LIMITS.agentsPerWorkspace} agents. Delete one to add another.` };
    }
    return { agent: store.createAgent({ workspaceId, ...fields }) };
  }

  /**
   * Runs a new task. The run is saved as unfinished first and updated when it ends, so a run that
   * never ends (the server stopped) is left as an honest row and not a missing one.
   */
  async function startRun(agent: AgentRecord, task: string, opts: RunOptions): Promise<AgentRunRecord> {
    const run = store.createAgentRun({
      agentId: agent.id,
      workspaceId: agent.workspaceId,
      task,
      status: 'error',
      output: 'The run did not finish.',
    });
    return whileActive(run.id, () => execute({ ...opts, agent, run, task, messages: [] }));
  }

  /** Whether a run of some agent is waiting on this pending action. */
  function hasWaitingRun(pendingActionId: string): boolean {
    return store.getAgentRunByPendingAction(pendingActionId) !== null;
  }

  /**
   * Carries on with the run that was waiting for this approval, with the task and history it
   * already has. What happens depends on what the user decided: a command that is still waiting
   * for a decision leaves the run alone, and a denied or already-used one closes it without
   * calling the model.
   */
  async function resumeRun(pendingActionId: string, opts: RunOptions & { agentId?: string }): Promise<ResumeResult> {
    const { agentId, ...runOptions } = opts;
    const waiting = store.getAgentRunByPendingAction(pendingActionId);
    const agent = waiting ? store.getAgent(waiting.agentId) : null;
    if (!waiting || !agent || (agentId !== undefined && waiting.agentId !== agentId)) {
      return { status: 404, error: NO_RUN_WAITING };
    }
    if (active.has(waiting.id)) return { status: 409, error: ALREADY_RUNNING };

    const action = store.getPendingAction(pendingActionId);
    if (!action) return { run: closeRun(waiting, 'error', ACTION_GONE) };
    if (action.status === 'pending') return { status: 409, error: DECIDE_FIRST };
    if (action.status === 'rejected') return { run: closeRun(waiting, 'cancelled', DENIED) };
    if (action.status === 'executed') return { run: closeRun(waiting, 'completed', RUN_ELSEWHERE) };

    const run = await whileActive(waiting.id, () => execute({
      ...runOptions,
      agent,
      run: waiting,
      task: waiting.task,
      messages: waiting.context,
      pendingActionId,
    }));
    return { run };
  }

  /**
   * Called after the user's decision on a command was recorded. A denial closes the run that was
   * waiting on it, wherever it was denied. Returns that run, or null when no run was waiting.
   */
  function settleDecision(pendingActionId: string, decision: 'approved' | 'rejected'): AgentRunRecord | null {
    if (decision !== 'rejected') return null;
    const waiting = store.getAgentRunByPendingAction(pendingActionId);
    return waiting ? closeRun(waiting, 'cancelled', DENIED) : null;
  }

  /** A run in the shape the Tasks page reads. */
  function taskOfRun(run: AgentRunRecord, priority: unknown) {
    return {
      id: run.id,
      workspaceId: run.workspaceId,
      instructions: run.task,
      priority,
      status: run.status === 'awaiting_approval' ? ('pending_confirmation' as const) : ('completed' as const),
      output: run.output,
      pendingActionId: run.pendingActionId,
    };
  }

  return { personaOf, resolveAgentForWorkspace, createAgentWithinLimit, startRun, hasWaitingRun, resumeRun, settleDecision, taskOfRun };
}

export type AgentRuns = ReturnType<typeof createAgentRuns>;
