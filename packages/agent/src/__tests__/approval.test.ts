import { describe, it, expect, vi, beforeEach } from 'vitest';

const callTool = vi.fn(async (tool: string, args: any) => ({ content: [{ type: 'text', text: `ran ${tool} ${JSON.stringify(args)}` }] }));
vi.mock('@torvaix/mcp', () => ({ getMcpClient: () => ({ callTool }) }));

import { MemoryStore } from '@torvaix/memory';
import { AgentOrchestrator } from '../orchestrator';

/** An LLM that returns the scripted replies in order. */
function scriptedLlm(replies: string[]) {
  return {
    complete: vi.fn(async () => ({ text: replies.shift() ?? '{"done": true, "message": "finished"}' })),
    getDefaultModel: () => 'test-model',
  } as any;
}

describe('code execution approval', () => {
  let store: MemoryStore;
  beforeEach(() => {
    callTool.mockClear();
    store = new MemoryStore(':memory:', { qdrantUrl: 'http://127.0.0.1:1' });
  });

  it('asks before running bash', async () => {
    const llm = scriptedLlm(['{"done": false, "tool": "bash", "args": {"command": "echo hi"}}']);
    const agent = new AgentOrchestrator(store, { llm, model: 'test-model' });
    const state = await agent.run({ workspaceId: 'default', instructions: 'x', nextNode: 'execution' } as any);

    expect(callTool).not.toHaveBeenCalled();
    expect(state.pendingActionId).toBeTruthy();
    expect(store.getPendingAction(state.pendingActionId!)?.status).toBe('pending');
  });

  it('runs only the approved command; the next command needs its own approval', async () => {
    const approvedId = store.createPendingAction('default', 'bash', { command: 'echo hi' });
    store.updatePendingActionStatus(approvedId, 'approved');

    const llm = scriptedLlm(['{"done": false, "tool": "bash", "args": {"command": "rm -rf important"}}']);
    const agent = new AgentOrchestrator(store, { llm, model: 'test-model' });
    const state = await agent.run({ workspaceId: 'default', instructions: 'clean up', pendingActionId: approvedId });

    expect(callTool).toHaveBeenCalledTimes(1);
    expect(callTool).toHaveBeenCalledWith('bash', { command: 'echo hi' });
    expect(state.pendingActionId).toBeTruthy();
    expect(state.pendingActionId).not.toBe(approvedId);
    expect(JSON.parse(store.getPendingAction(state.pendingActionId!)!.params)).toEqual({ command: 'rm -rf important' });
  });

  it('answers with the output when the model repeats the approved command', async () => {
    const approvedId = store.createPendingAction('default', 'bash', { command: 'echo hi' });
    store.updatePendingActionStatus(approvedId, 'approved');

    const llm = scriptedLlm(['{"done": false, "tool": "bash", "args": {"command": "echo hi"}}']);
    const agent = new AgentOrchestrator(store, { llm, model: 'test-model' });
    const state = await agent.run({ workspaceId: 'default', instructions: 'run echo hi', pendingActionId: approvedId });

    expect(callTool).toHaveBeenCalledTimes(1);
    expect(state.pendingActionId).toBeUndefined();
    expect(state.output).toBe('ran bash {"command":"echo hi"}');
  });

  it('never runs an approval twice', async () => {
    const approvedId = store.createPendingAction('default', 'python', { code: 'print(1)' });
    store.updatePendingActionStatus(approvedId, 'approved');
    const agent = () => new AgentOrchestrator(store, { llm: scriptedLlm([]), model: 'test-model' });

    await agent().run({ workspaceId: 'default', instructions: '', pendingActionId: approvedId });
    await agent().run({ workspaceId: 'default', instructions: '', pendingActionId: approvedId });
    expect(callTool).toHaveBeenCalledTimes(1);
  });
});
