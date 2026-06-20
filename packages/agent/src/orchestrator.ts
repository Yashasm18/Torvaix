import fetch from 'node-fetch';
import { MemoryStore } from '@torvaix/memory';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import crypto from 'crypto';
import { TraceCollector } from './trace';

export interface AgentState {
  workspaceId: string;
  instructions: string;
  messages: { role: 'user' | 'assistant' | 'system', content: string }[];
  nextNode: 'router' | 'memory' | 'knowledge' | 'execution' | 'end';
  output: string;
  pendingActionId?: string;
  iteration: number;
  trace?: TraceCollector;
}

export class AgentOrchestrator {
  private memoryStore: MemoryStore;
  private mcpClient: Client | null = null;
  private mcpTransport: StdioClientTransport | null = null;
  private sessionApproved = false; // Once user approves one tool, auto-approve rest of session
  private modelUrl = 'http://localhost:11434/api/generate';

  constructor(memoryStore: MemoryStore) {
    this.memoryStore = memoryStore;
  }

  public async initMcp() {
    if (this.mcpClient) return;

    // We start the MCP server as a subprocess using tsx
    const mcpServerPath = path.resolve(__dirname, '../../mcp/src/index.ts');
    
    this.mcpTransport = new StdioClientTransport({
      command: 'npx',
      args: ['tsx', mcpServerPath],
    });

    this.mcpClient = new Client(
      { name: 'torvaix-execution-agent', version: '1.0.0' },
      { capabilities: {} }
    );

    await this.mcpClient.connect(this.mcpTransport);
    console.log('[Orchestrator] Connected to MCP Server');
  }

  public async closeMcp() {
    if (this.mcpTransport) {
      await this.mcpTransport.close();
      this.mcpTransport = null;
      this.mcpClient = null;
    }
  }

  private async callLLM(prompt: string): Promise<string> {
    const response = await fetch(this.modelUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.2', // Could be dynamic based on provider
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.1,
          num_predict: 2000,
        }
      })
    });
    const data = await response.json() as any;
    return data.response || '';
  }

  // NODE: Router
  private async nodeRouter(state: AgentState): Promise<AgentState> {
    console.log('[Router Agent] Routing task...');
    const endTrace = state.trace?.startPhase('router', 'Classifying request');
    
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

    let decision = await this.callLLM(prompt);
    decision = decision.trim().toLowerCase();
    
    // Default fallback
    if (!['memory', 'knowledge', 'execution'].includes(decision)) {
      decision = 'execution';
    }

    endTrace?.({ decision });
    console.log(`[Router Agent] Decision: ${decision}`);
    state.nextNode = decision as any;
    return state;
  }

  // NODE: Memory (Retrieval)
  private async nodeMemory(state: AgentState): Promise<AgentState> {
    console.log('[Memory Agent] Retrieving context...');
    const endTrace = state.trace?.startPhase('memory', 'Retrieving memories');
    
    try {
      await this.memoryStore.initQdrant();
      const results = await this.memoryStore.queryMemory(state.workspaceId, state.instructions, 5);
      
      const hit = results.length > 0;
      let context = hit 
        ? results.map(r => `[Score: ${r.score.toFixed(2)}] ${r.content}`).join('\n')
        : 'No relevant memories found.';

      const prompt = `
The user asked: "${state.instructions}"
I retrieved the following memories from the vector database:
${context}

Synthesize a helpful answer.
`;
      const response = await this.callLLM(prompt);
      state.output = response;
      state.nextNode = 'end';
      endTrace?.({ hit, resultCount: results.length, topScore: results[0]?.score });
      
    } catch (e: any) {
      state.output = `Memory Error: ${e.message}`;
      state.nextNode = 'end';
      endTrace?.({ hit: false, error: e.message });
    }

    return state;
  }

  // NODE: Knowledge (Storage)
  private async nodeKnowledge(state: AgentState): Promise<AgentState> {
    console.log('[Knowledge Agent] Storing fact...');
    const endTrace = state.trace?.startPhase('knowledge', 'Storing memory');
    try {
      await this.memoryStore.initQdrant();
      await this.memoryStore.storeMemory(state.workspaceId, state.instructions, 'User Chat');
      state.output = "I have stored this information in my memory.";
      state.nextNode = 'end';
      endTrace?.({ stored: true });
    } catch (e: any) {
      state.output = `Knowledge Error: ${e.message}`;
      state.nextNode = 'end';
      endTrace?.({ stored: false, error: e.message });
    }
    return state;
  }

  // NODE: Execution (Tool Calling via MCP)
  private async nodeExecution(state: AgentState, onStreamChunk?: (chunk: string) => void): Promise<AgentState> {
    console.log('[Execution Agent] Planning execution...');
    const endTrace = state.trace?.startPhase('execution', 'Planning next step');

    // If there is a pending action, it means it was just approved
    if (state.pendingActionId) {
       const pending = this.memoryStore.getPendingAction(state.pendingActionId);
       if (pending && pending.status === 'approved') {
         console.log(`[Execution Agent] Resuming approved action: ${pending.action}`);
         this.sessionApproved = true; // User trusts this session now
         
         // Execute tool via MCP
         let resultText = '';
         const toolCallId = crypto.randomUUID();
         
         if (onStreamChunk) {
           onStreamChunk(`9:${JSON.stringify({ toolCallId, toolName: pending.action, args: JSON.parse(pending.params) })}\n`);
         }

         try {
           const result = await this.mcpClient?.callTool({
             name: pending.action,
             arguments: JSON.parse(pending.params)
           });
           resultText = (result as any)?.content?.[0]?.text || 'Tool executed, no output.';
           
           // Log execution
           this.memoryStore.logExecution(state.workspaceId, pending.action, JSON.parse(pending.params), resultText, 'success');
         } catch (e: any) {
           resultText = `Tool execution failed: ${e.message}`;
           this.memoryStore.logExecution(state.workspaceId, pending.action, JSON.parse(pending.params), resultText, 'error');
         }

         if (onStreamChunk) {
           onStreamChunk(`a:${JSON.stringify({ toolCallId, result: { output: resultText } })}\n`);
         }

         state.messages.push({ role: 'system', content: `Tool Result: ${resultText}` });
         state.pendingActionId = undefined; // Cleared
         // Continue the execution loop (don't stop here)
         state.nextNode = 'execution';
         return state;
       } else if (pending && pending.status === 'rejected') {
         console.log(`[Execution Agent] Action rejected by user: ${pending.action}`);
         state.messages.push({ role: 'system', content: `User rejected the execution of ${pending.action}.` });
         state.pendingActionId = undefined;
       }
    }

    // Now decide the next tool or finish
    const contextStr = state.messages.map(m => `[${m.role}] ${m.content}`).join('\n');
    const prompt = `You are the Execution Agent. You execute ONE step at a time.

Available tools:
- write_file: Write content to a file. Args: {"filePath": "path", "content": "file content"}
- read_file: Read a file. Args: {"filePath": "path"}
- bash: Run a shell command. Args: {"command": "shell command"}
- python: Execute Python code. Args: {"code": "python code"}
- web_search: Search the web. Args: {"query": "search query"}

Current task: "${state.instructions}"
${contextStr ? `History:\n${contextStr}` : ''}

CRITICAL RULES:
1. Return EXACTLY ONE JSON object. Never return multiple.
2. Do ONE step at a time. You will be called again for the next step.
3. To create a file, use write_file, NOT bash echo.
4. To run a Python file, use bash with: {"command": "python3 filename.py"}

If you need to use a tool, reply:
{"done": false, "tool": "write_file", "args": {"filePath": "hello.py", "content": "print('Hello')"}}

If the task is complete (all steps done), reply:
{"done": true, "message": "Summary of what was accomplished"}

Reply with ONLY ONE JSON object. Nothing else.`;

    const rawResponse = await this.callLLM(prompt);
    
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
        state.output = rawResponse; // Fallback if it just replied with text
        state.nextNode = 'end';
        return state;
      }

      const decision = JSON.parse(extractedJson);

      if (decision.done === true || !decision.tool) {
        state.output = decision.message || "Execution completed.";
        state.nextNode = 'end';
        return state;
      }

      // Check if it's a dangerous command (bash, python)
      const tool = decision.tool;
      const isDangerous = tool === 'bash' || tool === 'python';
      
      if (isDangerous && !this.sessionApproved) {
        console.log(`[Execution Agent] Pausing for security confirmation on ${tool}`);
        state.trace?.addEvent('approval', 'Waiting for user approval', { tool, args: decision.args });
        const pendingId = this.memoryStore.createPendingAction(state.workspaceId, tool, decision.args);
        
        state.pendingActionId = pendingId;
        state.output = `Security Confirmation Required for ${tool}. Please approve.`;
        // Paused loop by ending execution, NextJS will resume by re-invoking with pendingActionId
        endTrace?.({ tool, status: 'awaiting_approval' });
        state.nextNode = 'end'; 
        return state;
      } else if (isDangerous && this.sessionApproved) {
        console.log(`[Execution Agent] Auto-approved ${tool} (session trust)`);
        state.trace?.addEvent('approval', 'Auto-approved (session trust)', { tool });
      }

      // Execute safe tool immediately
      console.log(`[Execution Agent] Executing safe tool: ${tool}`);
      let resultText = '';
      const toolCallId = crypto.randomUUID();

      if (onStreamChunk) {
        onStreamChunk(`9:${JSON.stringify({ toolCallId, toolName: tool, args: decision.args })}\n`);
      }

      try {
        const result = await this.mcpClient?.callTool({
          name: tool,
          arguments: decision.args
        });
        resultText = (result as any)?.content?.[0]?.text || 'Tool executed, no output.';
        this.memoryStore.logExecution(state.workspaceId, tool, decision.args, resultText, 'success');
      } catch (e: any) {
        resultText = `Tool execution failed: ${e.message}`;
        this.memoryStore.logExecution(state.workspaceId, tool, decision.args, resultText, 'error');
      }

      if (onStreamChunk) {
        onStreamChunk(`a:${JSON.stringify({ toolCallId, result: { output: resultText } })}\n`);
      }

      state.messages.push({ role: 'system', content: `Tool ${tool} Result: ${resultText}` });
      endTrace?.({ tool, status: 'completed' });
      
      // Loop back to Execution Agent to see if it needs more tools
      state.nextNode = 'execution';

    } catch (e: any) {
      console.error('Failed to parse Execution Agent JSON:', rawResponse, e.message);
      state.output = `Agent parsing error: ${e.message}. Raw: ${rawResponse}`;
      state.nextNode = 'end';
    }

    return state;
  }

  // Run the Graph
  public async run(initialState: Partial<AgentState>, onStreamChunk?: (chunk: string) => void): Promise<AgentState> {
    await this.initMcp();

    const trace = new TraceCollector();

    let state: AgentState = {
      workspaceId: initialState.workspaceId || 'default',
      instructions: initialState.instructions || '',
      messages: initialState.messages || [],
      nextNode: initialState.pendingActionId ? 'execution' : (initialState.nextNode || 'router'),
      output: '',
      pendingActionId: initialState.pendingActionId,
      iteration: 0,
      trace
    };

    try {
      while (state.nextNode !== 'end' && state.iteration < 10) {
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
        }
      }
    } finally {
      trace.addEvent('complete', 'Agent run finished', { iterations: state.iteration, totalMs: trace.getTotalDurationMs() });
      // Stream the trace data to the frontend via the `o:` chunk type
      if (onStreamChunk) {
        onStreamChunk(`e:${trace.serialize()}\n`);
      }
    }

    return state;
  }
}
