import { describe, it, expect, vi, beforeEach } from 'vitest';

const callTool = vi.fn(async (tool: string, args: any) => ({ content: [{ type: 'text', text: `ran ${tool} ${JSON.stringify(args)}` }] }));
vi.mock('@torvaix/mcp', () => ({ getMcpClient: () => ({ callTool }) }));

import { MemoryStore } from '@torvaix/memory';
import { AgentOrchestrator, clipForModel } from '../orchestrator';

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

describe('cancelling a run', () => {
  beforeEach(() => callTool.mockClear());

  it('runs no tool once the client has gone', async () => {
    const store = new MemoryStore(':memory:', { qdrantUrl: 'http://127.0.0.1:1' });
    const cancel = new AbortController();
    // The user presses Stop while the model is still deciding what to do.
    const llm = {
      complete: vi.fn(async () => {
        cancel.abort();
        return { text: '{"done": false, "tool": "write_file", "args": {"filePath": "a.txt", "content": "x"}}' };
      }),
      getDefaultModel: () => 'test-model',
    } as any;

    const agent = new AgentOrchestrator(store, { llm, model: 'test-model' });
    const state = await agent.run({ workspaceId: 'default', instructions: 'write a file', nextNode: 'execution' } as any, undefined, { signal: cancel.signal });

    expect(callTool).not.toHaveBeenCalled();
    expect(llm.complete).toHaveBeenCalledTimes(1);
    expect(state.output).toBe('Stopped.');
  });

  it('leaves an approved action unclaimed when cancelled before it runs', async () => {
    const store = new MemoryStore(':memory:', { qdrantUrl: 'http://127.0.0.1:1' });
    const approvedId = store.createPendingAction('default', 'bash', { command: 'echo hi' });
    store.updatePendingActionStatus(approvedId, 'approved');
    const cancel = new AbortController();
    cancel.abort();

    const agent = new AgentOrchestrator(store, { llm: scriptedLlm([]), model: 'test-model' });
    await agent.run({ workspaceId: 'default', instructions: '', pendingActionId: approvedId }, undefined, { signal: cancel.signal });

    expect(callTool).not.toHaveBeenCalled();
    expect(store.getPendingAction(approvedId)?.status).toBe('approved');
  });
});

describe('tool results', () => {
  let store: MemoryStore;
  beforeEach(() => {
    callTool.mockReset();
    callTool.mockImplementation(async (tool: string, args: any) => ({ content: [{ type: 'text', text: `ran ${tool} ${JSON.stringify(args)}` }] }));
    store = new MemoryStore(':memory:', { qdrantUrl: 'http://127.0.0.1:1' });
  });

  it('records an approved command that fails as a failure, not a success', async () => {
    callTool.mockResolvedValueOnce({ content: [{ type: 'text', text: 'Command failed (exit 1): no such file' }], isError: true } as any);
    const approvedId = store.createPendingAction('default', 'bash', { command: 'cat missing.txt' });
    store.updatePendingActionStatus(approvedId, 'approved');

    const agent = new AgentOrchestrator(store, { llm: scriptedLlm([]), model: 'test-model' });
    const state = await agent.run({ workspaceId: 'default', instructions: '', pendingActionId: approvedId });

    expect(state.output).toBe('Tool execution failed: Command failed (exit 1): no such file');
    expect(store.listExecutionLogs('default')[0].status).toBe('error');
  });

  it('works in a workspace the server has no record of yet', async () => {
    const llm = scriptedLlm(['{"done": false, "tool": "bash", "args": {"command": "ls"}}']);
    const agent = new AgentOrchestrator(store, { llm, model: 'test-model' });
    const state = await agent.run({ workspaceId: 'made-in-the-browser', instructions: 'list files', nextNode: 'execution' } as any);

    expect(state.pendingActionId).toBeTruthy();
    expect(store.listPendingActions('made-in-the-browser', 'pending')).toHaveLength(1);
  });

  it('gives the model a shortened copy of a huge result and the user all of it', async () => {
    const huge = 'A'.repeat(50_000) + 'THE END';
    callTool.mockResolvedValueOnce({ content: [{ type: 'text', text: huge }] });
    const llm = scriptedLlm([
      '{"done": false, "tool": "read_file", "args": {"filePath": "big.log"}}',
      '{"done": true, "message": "It ends with THE END."}',
    ]);
    const chunks: string[] = [];
    const agent = new AgentOrchestrator(store, { llm, model: 'test-model' });
    await agent.run({ workspaceId: 'default', instructions: 'read big.log', nextNode: 'execution' } as any, c => chunks.push(c));

    const secondPrompt = llm.complete.mock.calls[1][1].map((m: { content: string }) => m.content).join('\n');
    expect(secondPrompt.length).toBeLessThan(12_000);
    expect(secondPrompt).toContain('THE END');
    expect(secondPrompt).toContain('read big.log');
    expect(chunks.join('')).toContain(huge);
    expect(JSON.parse(store.listExecutionLogs('default')[0].result!)).toBe(huge);
  });

  it('keeps the start and the end of a long result', () => {
    expect(clipForModel('short')).toBe('short');
    const clipped = clipForModel('start ' + 'x'.repeat(20_000) + ' end', 1000);
    expect(clipped.startsWith('start ')).toBe(true);
    expect(clipped.endsWith(' end')).toBe(true);
    expect(clipped).toMatch(/characters left out/);
    expect(clipped.length).toBeLessThan(1100);
  });

  it('does not ask for approval of a command that is missing', async () => {
    const llm = scriptedLlm([
      '{"done": false, "tool": "bash", "args": {}}',
      '{"done": false, "tool": "bash", "args": {"command": "   "}}',
    ]);
    const agent = new AgentOrchestrator(store, { llm, model: 'test-model' });
    const state = await agent.run({ workspaceId: 'default', instructions: 'do something', nextNode: 'execution' } as any);

    expect(state.pendingActionId).toBeUndefined();
    expect(store.listPendingActions('default')).toHaveLength(0);
    expect(state.output).toMatch(/couldn't work out the command/);
  });

  it('says so when it runs out of steps instead of ending with an empty reply', async () => {
    let n = 0;
    const llm = {
      complete: vi.fn(async () => ({ text: `{"done": false, "tool": "read_file", "args": {"filePath": "file-${n++}.txt"}}` })),
      getDefaultModel: () => 'test-model',
    } as any;
    const agent = new AgentOrchestrator(store, { llm, model: 'test-model' });
    const state = await agent.run({ workspaceId: 'default', instructions: 'read everything', nextNode: 'execution' } as any);

    expect(state.output).toMatch(/^I stopped after 10 steps without finishing this task\./);
    expect(state.output).toContain('ran read_file');
  });

  it('turns a reply that is not text into text', async () => {
    const llm = scriptedLlm(['{"done": true, "message": {"summary": "two files"}}']);
    const agent = new AgentOrchestrator(store, { llm, model: 'test-model' });
    const state = await agent.run({ workspaceId: 'default', instructions: 'summarise', nextNode: 'execution' } as any);

    expect(typeof state.output).toBe('string');
    expect(state.output).toContain('two files');
  });
});

describe('what a reply reports about itself', () => {
  let store: MemoryStore;
  beforeEach(() => {
    callTool.mockReset();
    callTool.mockImplementation(async (tool: string, args: any) => ({ content: [{ type: 'text', text: `ran ${tool} ${JSON.stringify(args)}` }] }));
    store = new MemoryStore(':memory:', { ollamaUrl: 'http://127.0.0.1:1', qdrantUrl: 'http://127.0.0.1:1' });
  });

  it('names the memory it saved, so the user can see and undo it', async () => {
    const agent = new AgentOrchestrator(store, { llm: scriptedLlm([]), model: 'test-model' });
    const state = await agent.run({ workspaceId: 'default', instructions: 'Remember that my favorite framework is Next.js' });

    expect(state.pulse.route).toBe('knowledge');
    expect(state.pulse.savedMemory?.content).toBe('Remember that my favorite framework is Next.js');
    expect(await store.getMemoryById(state.pulse.savedMemory!.id)).toBeTruthy();
    expect(state.pulse.model).toBe('test-model');
  });

  it('lists the memories an answer used, with how and when each was found', async () => {
    await store.storeMemory('default', 'My favorite framework is Next.js', 'User Chat');
    const agent = new AgentOrchestrator(store, { llm: scriptedLlm(['Next.js']), model: 'test-model' });
    const state = await agent.run({ workspaceId: 'default', instructions: 'Do you remember my favorite framework?' });

    expect(state.pulse.route).toBe('memory');
    expect(state.pulse.retrievedMemories).toHaveLength(1);
    expect(state.pulse.retrievedMemories[0]).toMatchObject({ content: 'My favorite framework is Next.js', match: 'keyword' });
    expect(state.pulse.retrievedMemories[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2} /);
    expect(state.pulse.steps.map(s => s.phase)).toEqual(['router', 'memory']);
    expect(state.pulse.steps.every(s => typeof s.durationMs === 'number')).toBe(true);
  });

  it('marks memories as "recent" when nothing matched and the latest ones were read instead', async () => {
    await store.storeMemory('default', 'The deploy runs on Fridays', 'User Chat');
    const agent = new AgentOrchestrator(store, { llm: scriptedLlm(['You deploy on Fridays.']), model: 'test-model' });
    const state = await agent.run({ workspaceId: 'default', instructions: 'What do you know about me?' });

    expect(state.pulse.retrievedMemories.map(m => m.match)).toEqual(['recent']);
  });

  it('records the tools that ran and an approval it is waiting for', async () => {
    const llm = scriptedLlm([
      '{"done": false, "tool": "write_file", "args": {"filePath": "a.txt", "content": "x"}}',
      '{"done": false, "tool": "bash", "args": {"command": "cat a.txt"}}',
    ]);
    const agent = new AgentOrchestrator(store, { llm, model: 'test-model' });
    const state = await agent.run({ workspaceId: 'default', instructions: 'write then show', nextNode: 'execution' } as any);

    expect(state.pulse.route).toBe('execution');
    expect(state.pulse.steps.filter(s => s.phase === 'tool_call').map(s => s.action)).toEqual(['Tool: write_file']);
    expect(state.pulse.awaitingApproval).toBe('bash');
  });
});

describe('runs that end in failure', () => {
  let store: MemoryStore;
  const failed = (text: string) => ({ content: [{ type: 'text', text }], isError: true }) as any;
  const readFile = (name: string) => `{"done": false, "tool": "read_file", "args": {"filePath": "${name}"}}`;
  const run = (llm: any) =>
    new AgentOrchestrator(store, { llm, model: 'test-model' }).run({ workspaceId: 'default', instructions: 'read the file', nextNode: 'execution' } as any);

  beforeEach(() => {
    callTool.mockReset();
    callTool.mockImplementation(async (tool: string, args: any) => ({ content: [{ type: 'text', text: `ran ${tool} ${JSON.stringify(args)}` }] }));
    store = new MemoryStore(':memory:', { qdrantUrl: 'http://127.0.0.1:1' });
  });

  it('is an error when the model never gives a command for bash', async () => {
    const state = await run(scriptedLlm(['{"done": false, "tool": "bash", "args": {}}', '{"done": false, "tool": "bash", "args": {"command": "   "}}']));

    expect(state.output).toBe("I couldn't work out the command to run. Try describing the step in more detail.");
    expect(state.error).toBe(state.output);
    expect(state.pendingActionId).toBeUndefined();
  });

  it('is an error when the model never gives code for python', async () => {
    const state = await run(scriptedLlm(['{"done": false, "tool": "python", "args": {}}', '{"done": false, "tool": "python", "args": {"code": ""}}']));

    expect(state.output).toMatch(/couldn't work out the code to run/);
    expect(state.error).toBe(state.output);
  });

  it('is an error when the model repeats a call that just failed', async () => {
    callTool.mockResolvedValueOnce(failed('no such file'));
    const state = await run(scriptedLlm([readFile('a.txt'), readFile('a.txt')]));

    expect(callTool).toHaveBeenCalledTimes(1);
    expect(state.output).toBe('Tool execution failed: no such file');
    expect(state.error).toBe(state.output);
  });

  it('is an error when tools keep failing', async () => {
    callTool.mockResolvedValueOnce(failed('no such file')).mockResolvedValueOnce(failed('no such file either'));
    const state = await run(scriptedLlm([readFile('a.txt'), readFile('b.txt')]));

    expect(callTool).toHaveBeenCalledTimes(2);
    expect(state.output).toBe('Execution aborted due to repeated tool failures: no such file either');
    expect(state.error).toBe(state.output);
  });

  it('is an error when the run hits the step limit', async () => {
    let n = 0;
    const llm = { complete: vi.fn(async () => ({ text: readFile(`file-${n++}.txt`) })), getDefaultModel: () => 'test-model' } as any;
    const state = await run(llm);

    expect(state.output).toMatch(/^I stopped after 10 steps without finishing this task\./);
    expect(state.error).toBe(state.output);
  });

  it('is an error when the model cannot be reached for a plain reply', async () => {
    const llm = { complete: vi.fn(async () => { throw new Error('model offline'); }), getDefaultModel: () => 'test-model' } as any;
    const state = await new AgentOrchestrator(store, { llm, model: 'test-model' })
      .run({ workspaceId: 'default', instructions: 'hello there', nextNode: 'conversation' } as any);

    expect(state.output).toBe('I hit an error while thinking that through: model offline');
    expect(state.error).toBe(state.output);
  });

  it('is not an error when the model repeats a call that worked: the answer is simply already there', async () => {
    const state = await run(scriptedLlm([readFile('a.txt'), readFile('a.txt')]));

    expect(callTool).toHaveBeenCalledTimes(1);
    expect(state.output).toBe('ran read_file {"filePath":"a.txt"}');
    expect(state.error).toBeUndefined();
  });

  it('is an error when the model repeats an approved command that failed', async () => {
    callTool.mockResolvedValueOnce(failed('command not found'));
    const approvedId = store.createPendingAction('default', 'bash', { command: 'nope' });
    store.updatePendingActionStatus(approvedId, 'approved');
    const llm = scriptedLlm(['{"done": false, "tool": "bash", "args": {"command": "nope"}}']);

    const state = await new AgentOrchestrator(store, { llm, model: 'test-model' })
      .run({ workspaceId: 'default', instructions: 'run nope', pendingActionId: approvedId });

    expect(callTool).toHaveBeenCalledTimes(1);
    expect(state.output).toBe('Tool execution failed: command not found');
    expect(state.error).toBe(state.output);
  });
});
