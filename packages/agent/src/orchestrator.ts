/**
 * Torvaix Agent Orchestrator
 *
 * Multi-agent state-graph orchestration with:
 * - Unified LLM client (multi-provider via LLMClient)
 * - MCP singleton for tool execution with auto-reconnect
 * - Per-tool approval with 5-minute expiry and workspace scoping
 * - Enhanced trace collection with timing, tokens, and errors
 * - Message history trimming to prevent context overflow
 */

import crypto from 'crypto';
import { LLMClient, type LLMMessage, type LLMResponse } from '@torvaix/providers';
import { MemoryStore } from '@torvaix/memory';
import { getMcpClient } from '@torvaix/mcp';
import { TraceCollector } from './trace';

// ── Torvaix Identity System Prompt ──
const TORVAIX_SYSTEM_PROMPT = `You are Torvaix, a workspace-first AI Operating System.
You are local-first, privacy-first, memory-powered, and agentic.
Your purpose is to transform conversations into knowledge, knowledge into memory, and memory into execution.

Core identity rules:
- Your name is Torvaix. Always refer to yourself as Torvaix.
- Never say you are a generic AI, ChatGPT, Claude, or any other assistant.
- If asked about your identity, be concise and direct. Do not speculate about your identity or explain previous versions unless explicitly asked.
- You operate inside the user's workspace with full context.
- You can read files, write files, search, reason, remember, and execute tasks.
- You are built for developers and knowledge workers who value privacy and control.`;

export interface AgentState {
  workspaceId: string;
  instructions: string;
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[];
  nextNode: 'router' | 'memory' | 'knowledge' | 'execution' | 'end';
  output: string;
  pendingActionId?: string;
  iteration: number;
  trace?: TraceCollector;
}

/** Per-tool approval entry with expiry. */
interface ToolApproval {
  tool: string;
  workspaceId: string;
  expiresAt: number; // epoch ms
}

export class AgentOrchestrator {
  private memoryStore: MemoryStore;
  private llm: LLMClient;
  private model: string;
  private approvedTools: Map<string, ToolApproval> = new Map();
  private readonly approvalDurationMs = 5 * 60 * 1000; // 5 minutes
  private readonly maxIterations = 10;
  private readonly maxContextChars: number;

  constructor(
    memoryStore: MemoryStore,
    options?: {
      llm?: LLMClient;
      model?: string;
      maxContextChars?: number;
    }
  ) {
    this.memoryStore = memoryStore;
    this.llm = options?.llm ?? new LLMClient();
    this.model = options?.model ?? process.env.TORVAIX_MODEL ?? this.llm.getDefaultModel();
    this.maxContextChars = options?.maxContextChars ?? 12000;
  }

  // ── Approval Hardening ──

  /** Check if a tool is currently approved for the given workspace. */
  private isToolApproved(tool: string, workspaceId: string): boolean {
    if (tool !== 'bash' && tool !== 'python') return true; // Safe tools need no approval

    const key = `${workspaceId}:${tool}`;
    const approval = this.approvedTools.get(key);
    if (!approval) return false;

    // Check expiry
    if (Date.now() > approval.expiresAt) {
      this.approvedTools.delete(key);
      return false;
    }
    return true;
  }

  /** Approve a tool for a workspace (called when user clicks Approve). */
  approveTool(tool: string, workspaceId: string): void {
    const key = `${workspaceId}:${tool}`;
    this.approvedTools.set(key, {
      tool,
      workspaceId,
      expiresAt: Date.now() + this.approvalDurationMs,
    });
  }

  /** Revoke all approvals for a workspace. */
  revokeApprovals(workspaceId: string): void {
    for (const key of this.approvedTools.keys()) {
      if (key.startsWith(`${workspaceId}:`)) {
        this.approvedTools.delete(key);
      }
    }
  }

  /** Clean up expired approvals. */
  private gcApprovals(): void {
    const now = Date.now();
    for (const [key, approval] of this.approvedTools.entries()) {
      if (now > approval.expiresAt) {
        this.approvedTools.delete(key);
      }
    }
  }

  // ── LLM Helper ──

  private async callLLM(messages: LLMMessage[]): Promise<LLMResponse> {
    const start = performance.now();
    try {
      const res = await this.llm.complete(this.model, messages, {
        temperature: 0.1,
        maxTokens: 4096,
      });
      const durationMs = performance.now() - start;
      // Trace the LLM call
      const trace = (messages as any).__trace as TraceCollector | undefined;
      if (trace) {
        trace.recordLLMCall(this.model, durationMs, res.usage);
      }
      return res;
    } catch (err: any) {
      const durationMs = performance.now() - start;
      const trace = (messages as any).__trace as TraceCollector | undefined;
      if (trace) {
        trace.recordLLMCall(this.model, durationMs, undefined, { error: err.message });
        trace.recordError('llm_call', err.message, { model: this.model });
      }
      throw err;
    }
  }

  // ── Message History Management ──

  private trimMessages(messages: AgentState['messages']): AgentState['messages'] {
    const systemMsgs = messages.filter(m => m.role === 'system');
    const chatMsgs = messages.filter(m => m.role !== 'system');

    // Estimate: ~4 chars per token
    const maxChars = this.maxContextChars - systemMsgs.reduce((s, m) => s + m.content.length, 0);
    let totalChars = 0;
    const keep: typeof chatMsgs = [];

    // Keep most recent messages that fit
    for (let i = chatMsgs.length - 1; i >= 0; i--) {
      const msgChars = chatMsgs[i].content.length;
      if (totalChars + msgChars > maxChars && keep.length > 0) break;
      keep.unshift(chatMsgs[i]);
      totalChars += msgChars;
    }

    return [...systemMsgs, ...keep];
  }

  // ── State Graph Nodes ──

  // NODE: Router
  private async nodeRouter(state: AgentState): Promise<AgentState> {
    console.log('[Router Agent] Routing task...');
    const endTrace = state.trace!.startPhase('router', 'Classifying request');

    // Fast-path routing for memory writes (bypasses LLM to guarantee persistence)
    const input = state.instructions.toLowerCase();
    const normalized = input.trim();

    // 0. Identity fast-path (Deterministic branding)
    if (
      normalized.includes("what is your name") ||
      normalized.includes("who are you") ||
      normalized.includes("whats your name") ||
      normalized.includes("what's your name") ||
      normalized.includes("whats ur name") ||
      normalized.includes("your name")
    ) {
      endTrace({ decision: 'end', bypass: true });
      console.log(`[Router Agent] Decision: identity (keyword bypass)`);
      state.output = "I am Torvaix, your workspace-first AI Operating System.";
      state.nextNode = 'end';
      return state;
    }

    // 1. memory_write
    if (
      input.includes("remember") ||
      input.includes("store this") ||
      input.includes("note this") ||
      input.includes("save this") ||
      input.includes("memorize this") ||
      input.includes("note to self")
    ) {
      endTrace({ decision: 'knowledge', bypass: true });
      console.log(`[Router Agent] Decision: knowledge (keyword bypass)`);
      state.nextNode = 'knowledge';
      return state;
    }

    // 2. memory_query
    if (
      input.includes("recall") ||
      input.includes("what do you know") ||
      input.includes("what did i say")
    ) {
      endTrace({ decision: 'memory', bypass: true });
      console.log(`[Router Agent] Decision: memory (keyword bypass)`);
      state.nextNode = 'memory';
      return state;
    }

    // 3. repo_analysis, code_generation, web_research, task_execution -> all map to 'execution'
    if (
      input.includes("analyze repo") ||
      input.includes("inspect code") ||
      input.includes("read file") ||
      input.includes("check routes") ||
      input.includes("architecture") ||
      input.includes("latest") ||
      input.includes("search") ||
      input.includes("research") ||
      input.includes("create") ||
      input.includes("write") ||
      input.includes("modify") ||
      input.includes("generate file")
    ) {
      endTrace({ decision: 'execution', bypass: true });
      console.log(`[Router Agent] Decision: execution (keyword bypass)`);
      state.nextNode = 'execution';
      return state;
    }

    const prompt = `Classify this user request into exactly ONE category.

CATEGORIES:
- "knowledge" = The user is TELLING you a fact to STORE/SAVE for later. Keywords: "remember that", "note that", "save this", "my favorite is", "I prefer", "keep in mind".
- "memory" = The user is ASKING you to RECALL/RETRIEVE something previously stored. Keywords: "what is my", "do you remember", "what did I say", "recall", "what do you know about me".
- "execution" = The user wants you to DO something: run code, read/write files, search the web, answer a question, solve a problem.

EXAMPLES:
- "Remember that my favorite framework is Next.js" → knowledge
- "What is my favorite framework?" → memory
- "Create a hello.py file" → execution
- "My preferred language is Python" → knowledge
- "What programming language do I prefer?" → memory
- "List all files in this directory" → execution
- "Note that the deadline is Friday" → knowledge

REQUEST: "${state.instructions}"

Reply with ONLY one word: memory, knowledge, or execution`;

    const messages: LLMMessage[] = [
      { role: 'system', content: 'You are a query classifier. Reply with exactly one word.' },
      { role: 'user', content: prompt },
    ];
    (messages as any).__trace = state.trace;

    try {
      const res = await this.callLLM(messages);
      let decision = res.text.trim().toLowerCase();

      if (!['memory', 'knowledge', 'execution'].includes(decision)) {
        decision = 'execution';
      }

      endTrace({ decision, model: this.model });
      console.log(`[Router Agent] Decision: ${decision}`);
      state.nextNode = decision as AgentState['nextNode'];
    } catch (err: any) {
      endTrace({ error: err.message });
      state.trace!.recordError('router', err.message);
      state.nextNode = 'execution'; // Fallback
    }

    return state;
  }

  // NODE: Memory (Retrieval)
  private async nodeMemory(state: AgentState): Promise<AgentState> {
    console.log('[Memory Agent] Retrieving context...');
    const endTrace = state.trace!.startPhase('memory', 'Retrieving memories');

    try {
      await this.memoryStore.initQdrant();
      const results = await this.memoryStore.queryMemory(state.workspaceId, state.instructions, 5);

      const hit = results.length > 0;
      const context = hit
        ? results.map(r => `[Score: ${r.score.toFixed(2)}] ${r.content}`).join('\n')
        : 'No relevant memories found.';

      const messages: LLMMessage[] = [
        { role: 'system', content: `${TORVAIX_SYSTEM_PROMPT}\n\nYou have access to the user's persistent memory store. Use retrieved memories to give personalized, context-aware answers.` },
        { role: 'user', content: `The user asked: "${state.instructions}"\n\nI retrieved the following memories:\n${context}\n\nSynthesize a helpful answer.` },
      ];
      (messages as any).__trace = state.trace;

      const res = await this.callLLM(messages);
      state.output = res.text;
      state.nextNode = 'end';
      endTrace({ hit, resultCount: results.length, topScore: results[0]?.score });
    } catch (e: any) {
      state.output = `Memory Error: ${e.message}`;
      state.nextNode = 'end';
      endTrace({ hit: false, error: e.message });
      state.trace!.recordError('memory', e.message);
    }

    return state;
  }

  // NODE: Knowledge (Storage)
  private async nodeKnowledge(state: AgentState): Promise<AgentState> {
    console.log('[Knowledge Agent] Storing fact...');
    const endTrace = state.trace!.startPhase('knowledge', 'Storing memory');

    try {
      await this.memoryStore.initQdrant();
      await this.memoryStore.storeMemory(state.workspaceId, state.instructions, 'User Chat');
      state.output = 'I have stored this information in my memory.';
      state.nextNode = 'end';
      endTrace({ stored: true });
    } catch (e: any) {
      state.output = `Knowledge Error: ${e.message}`;
      state.nextNode = 'end';
      endTrace({ stored: false, error: e.message });
      state.trace!.recordError('knowledge', e.message);
    }

    return state;
  }

  // NODE: Execution (Tool Calling via MCP)
  private async nodeExecution(state: AgentState, onStreamChunk?: (chunk: string) => void): Promise<AgentState> {
    console.log('[Execution Agent] Planning execution...');
    const endTrace = state.trace!.startPhase('execution', 'Planning next step');
    const mcp = getMcpClient();

    // If there is a pending action, it means it was just approved
    if (state.pendingActionId) {
      const pending = this.memoryStore.getPendingAction(state.pendingActionId);
      if (pending && pending.status === 'approved') {
        console.log(`[Execution Agent] Resuming approved action: ${pending.action}`);
        this.approveTool(pending.action, state.workspaceId);
        state.trace!.recordApproval(pending.action, true, { resumed: true });

        const toolCallId = crypto.randomUUID();
        if (onStreamChunk) {
          onStreamChunk(`9:${JSON.stringify({ toolCallId, toolName: pending.action, args: JSON.parse(pending.params) })}\n`);
        }

        const toolStart = performance.now();
        try {
          const result = await mcp.callTool(pending.action, JSON.parse(pending.params));
          const resultText = result.content?.[0]?.text ?? 'Tool executed, no output.';
          const durationMs = performance.now() - toolStart;

          this.memoryStore.logExecution(state.workspaceId, pending.action, JSON.parse(pending.params), resultText, 'success');
          state.trace!.recordToolCall(pending.action, durationMs, 'success');

          if (onStreamChunk) {
            onStreamChunk(`a:${JSON.stringify({ toolCallId, result: { output: resultText } })}\n`);
          }
          state.messages.push({ role: 'system', content: `Tool Result: ${resultText}` });
        } catch (e: any) {
          const durationMs = performance.now() - toolStart;
          const errorText = `Tool execution failed: ${e.message}`;
          this.memoryStore.logExecution(state.workspaceId, pending.action, JSON.parse(pending.params), errorText, 'error');
          state.trace!.recordToolCall(pending.action, durationMs, 'error', { error: e.message });
          state.trace!.recordError('tool_call', e.message, { tool: pending.action });

          if (onStreamChunk) {
            onStreamChunk(`a:${JSON.stringify({ toolCallId, result: { output: errorText } })}\n`);
          }
          state.messages.push({ role: 'system', content: errorText });
        }

        state.pendingActionId = undefined;
        state.nextNode = 'execution';
        return state;
      } else if (pending && pending.status === 'rejected') {
        console.log(`[Execution Agent] Action rejected by user: ${pending.action}`);
        state.messages.push({ role: 'system', content: `User rejected the execution of ${pending.action}.` });
        state.pendingActionId = undefined;
        state.trace!.recordApproval(pending.action, false, { rejected: true });
      }
    }

    // Build execution prompt
    const trimmedMessages = this.trimMessages(state.messages);
    const contextStr = trimmedMessages.map(m => `[${m.role}] ${m.content}`).join('\n');

    const execPrompt = `You are the Execution Agent. You execute ONE step at a time.

Available tools:
- write_file: Write content to a file. Args: {"filePath": "path", "content": "file content"}
- read_file: Read a file. Args: {"filePath": "path"}
- bash: Run a shell command. Args: {"command": "shell command"}
- python: Execute Python code. Args: {"code": "python code"}
- web_search: Search the web. Args: {"query": "search query"}
- repo_scan: Scan the workspace architecture and dependencies. Args: {}

Current task: "${state.instructions}"
${contextStr ? `History:\n${contextStr}` : ''}

CRITICAL RULES:
1. Return EXACTLY ONE JSON object. Never return multiple.
2. Do ONE step at a time. You will be called again for the next step.
3. To create a file, use write_file, NOT bash echo.
4. To run a Python file, use bash with: {"command": "python3 filename.py"}
5. After using write_file, when reporting completion, your message MUST include a success confirmation, the file path, and a preview of the first 20 lines. Format: "Created: <filename>\nPreview:\n<content>"
6. For repo analysis, use repo_scan and summarize the findings DIRECTLY in your completion message. Include tech stack, architecture, routes, dependencies, key files, and risks. Do NOT write markdown files automatically unless explicitly requested.

If you need to use a tool, reply:
{"done": false, "tool": "write_file", "args": {"filePath": "hello.py", "content": "print('Hello')"}}

If the task is complete (all steps done), reply:
{"done": true, "message": "Summary of what was accomplished"}

Reply with ONLY ONE JSON object. Nothing else.`;

    const messages: LLMMessage[] = [
      { role: 'system', content: `${TORVAIX_SYSTEM_PROMPT}\n\nYou are currently in Execution Mode. Reply with only JSON.` },
      { role: 'user', content: execPrompt },
    ];
    (messages as any).__trace = state.trace;

    let rawResponse: string;
    try {
      const res = await this.callLLM(messages);
      rawResponse = res.text;
    } catch (err: any) {
      state.output = `LLM Error: ${err.message}`;
      state.nextNode = 'end';
      endTrace({ error: err.message });
      return state;
    }

    // Robust bracket-counting JSON extractor
    let extractedJson: string | null = null;
    const startIdx = rawResponse.indexOf('{');
    if (startIdx !== -1) {
      let depth = 0;
      for (let i = startIdx; i < rawResponse.length; i++) {
        if (rawResponse[i] === '{') depth++;
        else if (rawResponse[i] === '}') {
          depth--;
          if (depth === 0) {
            extractedJson = rawResponse.substring(startIdx, i + 1);
            break;
          }
        }
      }
    }

    try {
      if (!extractedJson) {
        state.output = rawResponse; // Fallback: just return the text
        state.nextNode = 'end';
        endTrace({ fallback: 'raw_text' });
        return state;
      }

      const decision = JSON.parse(extractedJson);

      if (decision.done === true || !decision.tool) {
        state.output = decision.message ?? 'Execution completed.';
        state.nextNode = 'end';
        endTrace({ done: true });
        return state;
      }

      const tool = decision.tool as string;
      const isDangerous = tool === 'bash' || tool === 'python';

      // Check approval
      this.gcApprovals(); // Clean expired approvals first

      if (isDangerous && !this.isToolApproved(tool, state.workspaceId)) {
        console.log(`[Execution Agent] Pausing for security confirmation on ${tool}`);
        state.trace!.recordApproval(tool, false);
        const pendingId = this.memoryStore.createPendingAction(state.workspaceId, tool, decision.args);
        state.pendingActionId = pendingId;
        state.output = `Security Confirmation Required for ${tool}. Please approve.`;
        endTrace({ tool, status: 'awaiting_approval' });
        state.nextNode = 'end';
        return state;
      }

      if (isDangerous) {
        console.log(`[Execution Agent] Auto-approved ${tool} (valid workspace approval)`);
        state.trace!.recordApproval(tool, true);
      }

      // Execute tool
      console.log(`[Execution Agent] Executing tool: ${tool}`);
      const toolCallId = crypto.randomUUID();

      if (onStreamChunk) {
        onStreamChunk(`9:${JSON.stringify({ toolCallId, toolName: tool, args: decision.args })}\n`);
      }

      const toolStart = performance.now();
      try {
        const result = await mcp.callTool(tool, decision.args);
        const resultText = result.content?.[0]?.text ?? 'Tool executed, no output.';
        const durationMs = performance.now() - toolStart;

        this.memoryStore.logExecution(state.workspaceId, tool, decision.args, resultText, 'success');
        state.trace!.recordToolCall(tool, durationMs, 'success');

        if (onStreamChunk) {
          onStreamChunk(`a:${JSON.stringify({ toolCallId, result: { output: resultText } })}\n`);
        }
        state.messages.push({ role: 'system', content: `Tool ${tool} Result: ${resultText}` });
        endTrace({ tool, status: 'completed' });

        // Terminal condition for write_file to prevent infinite loops
        if (tool === 'write_file') {
          const filePath = decision.args.filePath || 'Unknown File';
          const content = decision.args.content || '';
          const preview = content.split('\n').slice(0, 10).join('\n');
          
          state.output = `Created: ${filePath}\nPath: ${filePath}\n\nPreview:\n${preview}`;
          state.nextNode = 'end';
          return state;
        }

        // Terminal condition for repo_scan to prevent infinite execution loops
        if (tool === 'repo_scan') {
          console.log('[Execution Agent] repo_scan complete, performing final summary bypass...');
          const summaryMessages: LLMMessage[] = [
            { role: 'system', content: `${TORVAIX_SYSTEM_PROMPT}\n\nYou are summarizing a repository scan. Output a structured Markdown summary directly in chat covering tech stack, architecture, routes, dependencies, key files, and risks. Do NOT write files. Be concise and authoritative.` },
            { role: 'user', content: `Analyze this repository scan and summarize:\n\n${resultText}` }
          ];
          (summaryMessages as any).__trace = state.trace;
          try {
            const summaryRes = await this.callLLM(summaryMessages);
            state.output = summaryRes.text;
          } catch (err: any) {
            state.output = `Repo scan complete, but summary failed: ${err.message}\n\nRaw scan:\n${resultText}`;
          }
          state.nextNode = 'end';
          return state;
        }

      } catch (e: any) {
        const durationMs = performance.now() - toolStart;
        const errorText = `Tool execution failed: ${e.message}`;
        this.memoryStore.logExecution(state.workspaceId, tool, decision.args, errorText, 'error');
        state.trace!.recordToolCall(tool, durationMs, 'error', { error: e.message });
        state.trace!.recordError('tool_call', e.message, { tool });

        if (onStreamChunk) {
          onStreamChunk(`a:${JSON.stringify({ toolCallId, result: { output: errorText } })}\n`);
        }
        state.messages.push({ role: 'system', content: errorText });
        endTrace({ tool, status: 'error', error: e.message });
      }

      // Loop back to Execution Agent for next step
      state.nextNode = 'execution';

    } catch (e: any) {
      console.error('Failed to parse Execution Agent JSON:', rawResponse, e.message);
      state.output = `Agent parsing error: ${e.message}. Raw: ${rawResponse}`;
      state.nextNode = 'end';
      state.trace!.recordError('execution', e.message, { rawResponse: rawResponse.slice(0, 500) });
      endTrace({ error: e.message });
    }

    return state;
  }

  // ── Main Run Loop ──

  async run(initialState: Partial<AgentState>, onStreamChunk?: (chunk: string) => void): Promise<AgentState> {
    const trace = new TraceCollector();

    let state: AgentState = {
      workspaceId: initialState.workspaceId ?? 'default',
      instructions: initialState.instructions ?? '',
      messages: initialState.messages ?? [],
      nextNode: initialState.pendingActionId ? 'execution' : (initialState.nextNode ?? 'router'),
      output: '',
      pendingActionId: initialState.pendingActionId,
      iteration: 0,
      trace,
    };

    try {
      while (state.nextNode !== 'end' && state.iteration < this.maxIterations) {
        state.iteration++;

        switch (state.nextNode) {
          case 'router':
            state = await this.nodeRouter(state);
            break;
          case 'memory':
            state = await this.nodeMemory(state);
            break;
          case 'knowledge':
            state = await this.nodeKnowledge(state);
            break;
          case 'execution':
            state = await this.nodeExecution(state, onStreamChunk);
            break;
          default:
            state.nextNode = 'end';
        }
      }

      if (state.iteration >= this.maxIterations) {
        trace.recordError('execution', `Max iterations (${this.maxIterations}) reached`);
      }
    } catch (e: any) {
      trace.recordError('execution', `Fatal: ${e.message}`);
      state.output = `Agent error: ${e.message}`;
    } finally {
      trace.addEvent('complete', 'Agent run finished', {
        iterations: state.iteration,
        totalMs: trace.getTotalDurationMs(),
        tokens: trace.getTokenUsage(),
      });

      if (onStreamChunk) {
        const traceJson = trace.serialize(state.iteration);
        // Use data annotation prefix (2:) with array wrapping per Vercel AI SDK protocol
        onStreamChunk(`2:${JSON.stringify([JSON.parse(traceJson)])}\n`);
      }
    }

    return state;
  }
}
