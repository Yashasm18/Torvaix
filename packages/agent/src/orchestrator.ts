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
import { ingestKnowledgeGraph, type MLIntelligencePayload } from '@torvaix/graph';
import { TraceCollector } from './trace';

// Intelligence (NLP) service — spaCy + sentence-transformers. Best-effort; never blocks a write.
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';

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

/**
 * Live "Knowledge Pulse" snapshot for the workspace side-panel. Accumulated during a
 * run and streamed to the frontend as a data annotation so the UI reflects exactly what
 * the agent retrieved, detected, and wrote this turn.
 */
export interface KnowledgePulseData {
  id: string;
  retrievedMemories: { id: string; content: string; source: string; score: number }[];
  detectedEntities: { text: string; type: string }[];
  relationships: { source: string; relation: string; target: string; confidence?: number }[];
  graphActivity: { nodesAdded: number; relationshipsAdded: number; updated: boolean };
  agentSteps: string[];
}

export interface AgentState {
  workspaceId: string;
  instructions: string;
  messages: LLMMessage[];
  nextNode: 'router' | 'memory' | 'knowledge' | 'execution' | 'conversation' | 'repo_analysis' | 'end';
  output: string;
  pendingActionId?: string;
  iteration: number;
  trace?: TraceCollector;
  final?: boolean;
  pulse: KnowledgePulseData;
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

  private async callLLM(
    messages: LLMMessage[],
    opts?: { temperature?: number; maxTokens?: number }
  ): Promise<LLMResponse> {
    const start = performance.now();
    try {
      const res = await this.llm.complete(this.model, messages, {
        temperature: opts?.temperature ?? 0.1,
        maxTokens: opts?.maxTokens ?? 4096,
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

    // 3. repo_analysis — deterministic bypass, NO execution agent
    if (
      input.includes("analyze repo") ||
      input.includes("repository architecture") ||
      input.includes("inspect code") ||
      input.includes("check routes") ||
      input.includes("architecture")
    ) {
      endTrace({ decision: 'repo_analysis', bypass: true });
      console.log(`[Router Agent] Decision: repo_analysis (deterministic bypass)`);
      state.nextNode = 'repo_analysis';
      return state;
    }

    // 4. code_generation, web_research, task_execution -> execution
    if (
      input.includes("read file") ||
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
- "execution" = The user wants you to perform an ACTION on the machine: run code, read/write files, search the web for live info. Keywords: "run", "create a file", "read the file", "search the web".
- "conversation" = The user wants an explanation, answer, opinion, or general help that does NOT need a tool or stored memory. This is the DEFAULT for questions and chat. Keywords: "explain", "what is", "how does", "why", "can you help", "tell me about".

EXAMPLES:
- "Remember that my favorite framework is Next.js" → knowledge
- "What is my favorite framework?" → memory
- "Create a hello.py file" → execution
- "My preferred language is Python" → knowledge
- "What programming language do I prefer?" → memory
- "List all files in this directory" → execution
- "Note that the deadline is Friday" → knowledge
- "Explain how transformers work" → conversation
- "Can you explain this to me?" → conversation
- "What is the capital of France?" → conversation
- "Help me brainstorm names for my app" → conversation

REQUEST: "${state.instructions}"

Reply with ONLY one word: memory, knowledge, execution, or conversation`;

    const messages: LLMMessage[] = [
      { role: 'system', content: 'You are a query classifier. Reply with exactly one word.' },
      { role: 'user', content: prompt },
    ];
    (messages as any).__trace = state.trace;

    try {
      const res = await this.callLLM(messages);
      let decision = res.text.trim().toLowerCase();

      if (!['memory', 'knowledge', 'execution', 'conversation'].includes(decision)) {
        // Anything ambiguous becomes a normal conversation, not a broken tool plan.
        decision = 'conversation';
      }

      endTrace({ decision, model: this.model });
      console.log(`[Router Agent] Decision: ${decision}`);
      state.nextNode = decision as AgentState['nextNode'];
    } catch (err: any) {
      endTrace({ error: err.message });
      state.trace!.recordError('router', err.message);
      state.nextNode = 'conversation'; // Fallback: answer the user rather than fail
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

      // Surface retrieved memories to the Knowledge Pulse panel.
      state.pulse.retrievedMemories = results.map(r => ({
        id: r.id,
        content: r.content,
        source: r.source,
        score: r.score,
      }));

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

  // NODE: Conversation (General-purpose, memory-augmented chat)
  // This is the default route for questions/explanations/help that don't need a
  // tool or an explicit memory lookup. It answers naturally with the LLM, and
  // quietly injects any relevant stored memories as context (never as a gate).
  private async nodeConversation(state: AgentState): Promise<AgentState> {
    console.log('[Conversation Agent] Answering with memory context...');
    const endTrace = state.trace!.startPhase('conversation', 'Answering with context');

    // Best-effort memory recall — if it fails or is empty, we still answer.
    let memoryContext = '';
    let memHit = false;
    try {
      await this.memoryStore.initQdrant();
      const results = await this.memoryStore.queryMemory(state.workspaceId, state.instructions, 3);
      const relevant = results.filter(r => r.score > 0.4);
      if (relevant.length > 0) {
        memHit = true;
        memoryContext =
          `\n\nRelevant things you remember about this user (use only if helpful, do not force them in):\n` +
          relevant.map(r => `- ${r.content}`).join('\n');
        // Surface the memories that actually informed this answer to the Knowledge Pulse panel.
        state.pulse.retrievedMemories = relevant.map(r => ({
          id: r.id,
          content: r.content,
          source: r.source,
          score: r.score,
        }));
      }
    } catch (e: any) {
      state.trace!.recordError('conversation', `memory recall failed: ${e.message}`);
    }

    // Rebuild the conversation for the LLM: system prompt (+ memory), prior turns, current message.
    const history = this.trimMessages(
      state.messages.filter(m => m.role === 'user' || m.role === 'assistant')
    );

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content:
          `${TORVAIX_SYSTEM_PROMPT}\n\n` +
          `You are in a normal conversation with the user. Answer their question or request directly, ` +
          `clearly, and helpfully in natural language. Do NOT output JSON, tool calls, or apologies about ` +
          `missing memory. If the message is vague, give your best helpful answer and, if truly needed, ask ` +
          `one short clarifying question.${memoryContext}`,
      },
      ...history,
      { role: 'user', content: state.instructions },
    ];
    (messages as any).__trace = state.trace;

    try {
      const res = await this.callLLM(messages, { temperature: 0.6 });
      state.output = res.text.trim() || "Could you tell me a bit more about what you'd like help with?";
      endTrace({ memHit });
    } catch (e: any) {
      state.output = `I hit an error while thinking that through: ${e.message}`;
      endTrace({ error: e.message });
      state.trace!.recordError('conversation', e.message);
    }

    state.nextNode = 'end';
    return state;
  }

  // NODE: Knowledge (Storage)
  private async nodeKnowledge(state: AgentState): Promise<AgentState> {
    console.log('[Knowledge Agent] Storing fact...');
    const endTrace = state.trace!.startPhase('knowledge', 'Storing memory');

    try {
      await this.memoryStore.initQdrant();
      await this.memoryStore.storeMemory(state.workspaceId, state.instructions, 'User Chat');

      // NLP enrichment (best-effort): extract entities/relationships via the Python
      // intelligence layer and fold them into the knowledge graph. This never blocks
      // or fails the write — if the service is down, we still stored the memory.
      const intel = await this.extractIntelligence(state.instructions, state.trace);
      if (intel) {
        const entityCount = intel.entities?.length ?? 0;
        const relCount = intel.relationships?.length ?? 0;

        // Surface extracted knowledge to the Knowledge Pulse panel.
        state.pulse.detectedEntities = intel.entities ?? [];
        state.pulse.relationships = intel.relationships ?? [];
        state.pulse.graphActivity = {
          nodesAdded: entityCount,
          relationshipsAdded: relCount,
          updated: entityCount + relCount > 0,
        };

        state.output =
          entityCount + relCount > 0
            ? `Got it — I've saved that and added ${entityCount} entit${entityCount === 1 ? 'y' : 'ies'} ` +
              `and ${relCount} relationship${relCount === 1 ? '' : 's'} to your knowledge graph.`
            : "Got it — I've saved that to memory.";
      } else {
        state.output = "Got it — I've saved that to memory.";
      }

      state.nextNode = 'end';
      endTrace({ stored: true, enriched: !!intel });
    } catch (e: any) {
      state.output = `Knowledge Error: ${e.message}`;
      state.nextNode = 'end';
      endTrace({ stored: false, error: e.message });
      state.trace!.recordError('knowledge', e.message);
    }

    return state;
  }

  /**
   * Best-effort call to the Python NLP intelligence layer (spaCy + sentence-transformers).
   * Returns the extracted payload and ingests it into the knowledge graph, or null if the
   * service is unavailable. Never throws — memory persistence must not depend on this.
   */
  private async extractIntelligence(
    text: string,
    trace?: TraceCollector
  ): Promise<MLIntelligencePayload | null> {
    const endTrace = trace?.startPhase('knowledge', 'NLP intelligence extraction');
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${PYTHON_SERVICE_URL}/analyze/memory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        endTrace?.({ ok: false, status: res.status });
        return null;
      }

      const intel = (await res.json()) as MLIntelligencePayload;
      ingestKnowledgeGraph(intel);
      endTrace?.({
        ok: true,
        entities: intel.entities?.length ?? 0,
        relationships: intel.relationships?.length ?? 0,
      });
      return intel;
    } catch (e: any) {
      // Service down, timeout, or malformed response — degrade gracefully.
      endTrace?.({ ok: false, error: e.message });
      trace?.recordError('knowledge', `intelligence layer unavailable: ${e.message}`);
      return null;
    }
  }

  // NODE: Repo Analysis (Deterministic — NO LLM, NO loop)
  private async nodeRepoAnalysis(state: AgentState, workspacePath: string, onStreamChunk?: (chunk: string) => void): Promise<AgentState> {
    console.log('[STEP START] nodeRepoAnalysis — deterministic bypass');
    const toolCallId = `repo_scan_${crypto.randomUUID()}`;
    const endTrace = state.trace!.startPhase('repo_analysis', 'Deterministic repo scan');
    if (onStreamChunk) {
      onStreamChunk(`> Running instantaneous repository analysis...\n`);
    }

    try {
      const mcp = getMcpClient(workspacePath);
      const mcpResult = await mcp.callTool('repo_scan', {});
      
      let resultText = '';
      if (mcpResult.content && mcpResult.content.length > 0) {
        resultText = mcpResult.content.map((c: any) => c.text).join('\n');
      } else {
        resultText = 'Repo scan returned no output.';
      }
      
      console.log('[TOOL EXECUTED] repo_scan');

      if (onStreamChunk) {
        onStreamChunk(`a:${JSON.stringify({ toolCallId, result: { output: resultText } })}\n`);
      }

      // Parse deterministically
      let pkg = 'Unknown';
      let deps = 'Unknown';
      let structure = 'Unknown';

      if (resultText.includes('Package:')) {
        pkg = resultText.split('Package:')[1]?.split('\n')[0]?.trim() || 'Unknown';
      }
      if (resultText.includes('Dependencies:')) {
        deps = resultText.split('Dependencies:')[1]?.split('\n')[0]?.trim() || 'Unknown';
      }
      if (resultText.includes('Structure:')) {
        structure = resultText.split('Structure:')[1]?.trim() || 'Unknown';
      }

      state.output = `## Repository Architecture Summary

**Package:** ${pkg}

**Dependencies:** ${deps}

**Directory Structure:**
\`\`\`
${structure}
\`\`\`

*Analysis completed via deterministic repo_scan.*`;

      this.memoryStore.logExecution(state.workspaceId, 'repo_scan', {}, resultText, 'success');
      state.trace!.recordToolCall('repo_scan', 0, 'success');
      endTrace({ status: 'completed' });
    } catch (e: any) {
      state.output = `Repo analysis failed: ${e.message}`;
      endTrace({ status: 'error', error: e.message });
      state.trace!.recordError('repo_analysis', e.message);
    }

    // Hard terminate — no further steps
    console.log('[FINAL BREAK] nodeRepoAnalysis complete');
    state.final = true;
    state.nextNode = 'end';
    return state;
  }

  // NODE: Execution (Tool Calling via MCP)
  private lastToolCall: { tool: string; argsHash: string } | null = null;

  private async nodeExecution(state: AgentState, workspacePath: string, onStreamChunk?: (chunk: string) => void): Promise<AgentState> {
    console.log('[Execution Agent] Planning execution...');
    const endTrace = state.trace!.startPhase('execution', 'Planning and tool execution');
    const mcp = getMcpClient(workspacePath);

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
3. To create a file, use write_file. If the user asks you to create a script and then run it, you must FIRST call write_file in step 1, and THEN call bash in step 2.
4. To run a script, use bash with the appropriate execution command (e.g. "python3 script.py"). Note that files are created relative to the workspace root.
5. After using write_file, wait for the next iteration to run it. When reporting final completion to the user, include a success confirmation.
6. For repo analysis, use repo_scan and summarize the findings DIRECTLY in your completion message. Include tech stack, architecture, routes, dependencies, key files, and risks. Do NOT write markdown files automatically unless explicitly requested.
7. NEVER call the same tool with the same arguments twice. If you already have results from a tool call in the History, you MUST use those results to respond. Calling the same tool again is STRICTLY FORBIDDEN.
8. After web_search returns results, you MUST immediately respond with {"done": true, "message": "..."} containing a synthesized summary of the search results. NEVER call web_search again after receiving results.
9. If you run a script or command to get a result for the user, you MUST include the output of that command in your final "message" response.

If you need to use a tool, reply:
{"done": false, "tool": "write_file", "args": {"filePath": "example.txt", "content": "File content"}}

If the task is complete (all steps done) or if you want to respond to the user via chat, reply:
{"done": true, "message": "Your response to the user here"}

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

      // ── Duplicate tool call detection ──
      const argsHash = JSON.stringify(decision.args || {});
      if (this.lastToolCall && this.lastToolCall.tool === tool && this.lastToolCall.argsHash === argsHash) {
        console.log(`[FINAL BREAK] Duplicate tool call detected: ${tool} with same args. Forcing synthesis.`);
        // Force the LLM to synthesize from existing context
        const lastResult = state.messages.filter(m => m.content.startsWith(`Tool ${tool} Result:`)).pop();
        if (lastResult) {
          state.output = lastResult.content.replace(`Tool ${tool} Result: `, '');
        } else {
          state.output = 'The requested information was already retrieved. Please check the results above.';
        }
        state.final = true;
        state.nextNode = 'end';
        this.lastToolCall = null;
        endTrace({ tool, status: 'duplicate_blocked' });
        return state;
      }
      this.lastToolCall = { tool, argsHash };

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
        
        if ((result as any).isError) {
            throw new Error(result.content?.[0]?.text ?? 'Unknown tool error');
        }

        const resultText = result.content?.[0]?.text ?? 'Tool executed, no output.';
        const durationMs = performance.now() - toolStart;

        this.memoryStore.logExecution(state.workspaceId, tool, decision.args, resultText, 'success');
        state.trace!.recordToolCall(tool, durationMs, 'success');

        if (onStreamChunk) {
          onStreamChunk(`a:${JSON.stringify({ toolCallId, result: { output: resultText } })}\n`);
        }
        state.messages.push({ role: 'system', content: `Tool ${tool} Result: ${resultText}` });
        endTrace({ tool, status: 'completed' });

        // write_file no longer terminates execution, so the agent can write a file and then run it.
        if (tool === 'write_file') {
          console.log('[STEP] write_file complete, continuing execution...');
        }

        // Terminal condition for repo_scan (belt-and-suspenders, primary path is nodeRepoAnalysis)
        if (tool === 'repo_scan') {
          console.log('[FINAL BREAK] repo_scan complete (execution fallback)');
          state.output = resultText;
          state.final = true;
          state.nextNode = 'end';
          return state;
        }

        // Terminal condition for web_search — force the LLM to synthesize on the next iteration
        if (tool === 'web_search') {
          console.log('[WEB_SEARCH] Results received, forcing synthesis on next iteration.');
          state.messages.push({ role: 'system', content: 'SYSTEM: web_search results are above. You MUST now respond with {"done": true, "message": "..."} containing a summary. Do NOT call web_search again.' });
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
        
        const prevMsg = state.messages.length > 0 ? state.messages[state.messages.length - 1] : null;
        state.messages.push({ role: 'system', content: errorText });
        endTrace({ tool, status: 'error', error: e.message });

        if (prevMsg && prevMsg.content.startsWith('Tool execution failed:')) {
          console.log('[FINAL BREAK] Repeated tool failure. Aborting execution.');
          state.output = `Execution aborted due to repeated tool failures: ${e.message}`;
          state.final = true;
          state.nextNode = 'end';
        }
      }

      // Loop back to Execution Agent for next step (only if not already terminated)
      if (!state.final && state.nextNode !== 'end') {
        state.nextNode = 'execution';
      }

    } catch (e: any) {
      console.error('Failed to parse Execution Agent JSON:', rawResponse, e.message);
      
      const prevMsg = state.messages.length > 0 ? state.messages[state.messages.length - 1] : null;
      if (prevMsg && prevMsg.content.includes('JSON Parsing Error')) {
        state.output = `Agent parsing error: ${e.message}. Raw: ${rawResponse}`;
        state.nextNode = 'end';
        endTrace({ error: e.message });
      } else {
        console.log('[Execution Agent] JSON parse failed. Prompting LLM to fix unescaped quotes.');
        state.messages.push({ role: 'system', content: `JSON Parsing Error: ${e.message}. Your JSON was invalid (likely due to unescaped double quotes inside the "content" string). You MUST escape all double quotes inside strings with \\". Please retry and return valid JSON.` });
        state.nextNode = 'execution';
        endTrace({ tool: 'json_fix', status: 'retrying' });
      }
      state.trace!.recordError('execution', e.message, { rawResponse: rawResponse.slice(0, 500) });
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
      pulse: {
        id: crypto.randomUUID(),
        retrievedMemories: [],
        detectedEntities: [],
        relationships: [],
        graphActivity: { nodesAdded: 0, relationshipsAdded: 0, updated: false },
        agentSteps: [],
      },
    };

    // Fetch workspace path for isolated MCP execution
    const workspace = this.memoryStore.getWorkspace(state.workspaceId);
    let workspaceSettings: any = {};
    try {
      if (workspace && workspace.settings) {
        workspaceSettings = JSON.parse(workspace.settings);
      }
    } catch(e) {}
    const workspacePath = workspaceSettings.path || process.cwd();

    try {
      while (state.nextNode !== 'end' && !state.final && state.iteration < this.maxIterations) {
        state.iteration++;
        console.log(`[STEP START] Iteration ${state.iteration}`);

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
          case 'conversation':
            state = await this.nodeConversation(state);
            break;
          case 'repo_analysis':
            state = await this.nodeRepoAnalysis(state, workspacePath, onStreamChunk);
            break;
          case 'execution':
            state = await this.nodeExecution(state, workspacePath, onStreamChunk);
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

      // Derive a clean reasoning path from the high-level agent phases only, dropping
      // low-level sub-events (llm_call) and terminal/error markers.
      const stepPhases = new Set([
        'router', 'memory', 'knowledge', 'conversation', 'execution', 'repo_analysis',
      ]);
      state.pulse.agentSteps = trace
        .getTrace()
        .filter(e => stepPhases.has(e.phase))
        .map(e => `${e.phase}: ${e.action}`);

      if (onStreamChunk) {
        const traceJson = trace.serialize(state.iteration);
        // Use data annotation prefix (2:) with array wrapping per Vercel AI SDK protocol.
        // Two separate annotations: the trace, and the Knowledge Pulse snapshot.
        onStreamChunk(`2:${JSON.stringify([JSON.parse(traceJson)])}\n`);
        onStreamChunk(`2:${JSON.stringify([{ torvaixPulse: state.pulse }])}\n`);
      }
    }

    return state;
  }
}
