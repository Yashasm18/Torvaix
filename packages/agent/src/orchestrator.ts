import fetch from 'node-fetch';
import { MemoryStore } from '@torvaix/memory';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';

export interface AgentState {
  workspaceId: string;
  instructions: string;
  messages: { role: 'user' | 'assistant' | 'system', content: string }[];
  nextNode: 'router' | 'memory' | 'knowledge' | 'execution' | 'end';
  output: string;
  pendingActionId?: string;
  iteration: number;
}

export class AgentOrchestrator {
  private memoryStore: MemoryStore;
  private mcpClient: Client | null = null;
  private mcpTransport: StdioClientTransport | null = null;
  private modelUrl = 'http://localhost:11434/api/generate';

  constructor(memoryStore: MemoryStore) {
    this.memoryStore = memoryStore;
  }

  public async initMcp() {
    if (this.mcpClient) return;

    // We start the MCP server as a subprocess using tsx
    const mcpServerPath = path.resolve(process.cwd(), 'packages/mcp/src/index.ts');
    
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

    state.nextNode = decision as any;
    return state;
  }

  // NODE: Memory (Retrieval)
  private async nodeMemory(state: AgentState): Promise<AgentState> {
    console.log('[Memory Agent] Retrieving context...');
    
    try {
      await this.memoryStore.initQdrant();
      const results = await this.memoryStore.queryMemory(state.workspaceId, state.instructions, 5);
      
      let context = results.length > 0 
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
      
    } catch (e: any) {
      state.output = `Memory Error: ${e.message}`;
      state.nextNode = 'end';
    }

    return state;
  }

  // NODE: Knowledge (Storage)
  private async nodeKnowledge(state: AgentState): Promise<AgentState> {
    console.log('[Knowledge Agent] Storing fact...');
    try {
      await this.memoryStore.initQdrant();
      await this.memoryStore.storeMemory(state.workspaceId, state.instructions, 'User Chat');
      state.output = "I have stored this information in my memory.";
      state.nextNode = 'end';
    } catch (e: any) {
      state.output = `Knowledge Error: ${e.message}`;
      state.nextNode = 'end';
    }
    return state;
  }

  // NODE: Execution (Tool Calling via MCP)
  private async nodeExecution(state: AgentState): Promise<AgentState> {
    console.log('[Execution Agent] Planning execution...');

    // If there is a pending action, it means it was just approved
    if (state.pendingActionId) {
       const pending = this.memoryStore.getPendingAction(state.pendingActionId);
       if (pending && pending.status === 'approved') {
         console.log(`[Execution Agent] Resuming approved action: ${pending.action}`);
         
         // Execute tool via MCP
         let resultText = '';
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

         state.messages.push({ role: 'system', content: `Tool Result: ${resultText}` });
         state.pendingActionId = undefined; // Cleared
       } else if (pending && pending.status === 'rejected') {
         console.log(`[Execution Agent] Action rejected by user: ${pending.action}`);
         state.messages.push({ role: 'system', content: `User rejected the execution of ${pending.action}.` });
         state.pendingActionId = undefined;
       }
    }

    // Now decide the next tool or finish
    const contextStr = state.messages.map(m => `[${m.role}] ${m.content}`).join('\n');
    const prompt = `You are the Execution Agent. You have access to tools: read_file, write_file, bash, python, web_search.
Current task: "${state.instructions}"
History:
${contextStr}

If you need to use a tool, reply with exactly this JSON format:
{"done": false, "tool": "bash", "args": {"command": "echo 'Hello World'"}}

If you have finished the task or no tools are needed, reply with exactly this JSON format:
{"done": true, "message": "Final answer here..."}

Respond with ONLY the raw JSON object. Do not wrap it in markdown. Do not add any conversational text.`;

    const rawResponse = await this.callLLM(prompt);
    
    try {
      // Find JSON block in the raw response
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        state.output = rawResponse; // Fallback if it just replied with text
        state.nextNode = 'end';
        return state;
      }

      const decision = JSON.parse(jsonMatch[0]);

      if (decision.done === true || !decision.tool) {
        state.output = decision.message || "Execution completed.";
        state.nextNode = 'end';
        return state;
      }

      // Check if it's a dangerous command (bash, python)
      const tool = decision.tool;
      const isDangerous = tool === 'bash' || tool === 'python';
      
      if (isDangerous) {
        console.log(`[Execution Agent] Pausing for security confirmation on ${tool}`);
        const pendingId = this.memoryStore.createPendingAction(state.workspaceId, tool, decision.args);
        
        state.pendingActionId = pendingId;
        state.output = `Security Confirmation Required for ${tool}. Please approve.`;
        // Paused loop by ending execution, NextJS will resume by re-invoking with pendingActionId
        state.nextNode = 'end'; 
        return state;
      }

      // Execute safe tool immediately
      console.log(`[Execution Agent] Executing safe tool: ${tool}`);
      let resultText = '';
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

      state.messages.push({ role: 'system', content: `Tool ${tool} Result: ${resultText}` });
      
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
  public async run(initialState: Partial<AgentState>): Promise<AgentState> {
    await this.initMcp();

    let state: AgentState = {
      workspaceId: initialState.workspaceId || 'default',
      instructions: initialState.instructions || '',
      messages: initialState.messages || [],
      nextNode: initialState.nextNode || 'router',
      output: '',
      pendingActionId: initialState.pendingActionId,
      iteration: 0
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
            state = await this.nodeExecution(state);
            break;
        }
      }
    } finally {
      // If we are completely done (no pending action), we can optionally close MCP
      // But usually we keep it alive or close it based on app lifecycle.
      // await this.closeMcp();
    }

    return state;
  }
}
