"use client";

import { useState } from "react";
import { useDBStore } from "@/store/db-store";
import { AppLogo } from "@/components/ui/app-logo";
import { Button } from "@/components/ui/button";
import { queryMemoryAction } from "@/actions/memory-actions";
import { Loader2, Zap, MessageSquare, Terminal } from "lucide-react";

export default function ContextDebugPage() {
  const { activeWorkspaceId } = useDBStore();
  const workspaceId = activeWorkspaceId || 'test';

  const [testQuery, setTestQuery] = useState("");
  const [retrieved, setRetrieved] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const simulateAutoInjection = async () => {
    if (!testQuery) return;
    setLoading(true);
    const res = await queryMemoryAction(workspaceId, testQuery, 3);
    if (res.success && res.results) {
      setRetrieved(res.results.filter((m: any) => m.score > 0.5));
    }
    setLoading(false);
  };

  const getSystemPrompt = () => {
    let memoryContextStr = "No relevant memories found in context.";
    if (retrieved.length > 0) {
      memoryContextStr = retrieved.map(m => `- [${(m.score*100).toFixed(1)}%] ${m.content} (Source: ${m.source})`).join('\n');
    }

    return `You are TORVAIX, an AI Operating System running locally on the user's machine.

[WORKSPACE CONTEXT ENGINE]
Current Date/Time: ${new Date().toLocaleString()}
Active Workspace ID: ${workspaceId}

[AUTONOMOUS MEMORY RETRIEVAL]
The following memories are highly relevant to the user's current query:
${memoryContextStr}

You have access to local tools: bash, read_file, python, web_search, store_memory, query_memory, update_memory, and delete_memory.
Before executing tools, briefly plan your steps. For example:
"1. List directory contents
2. Read the configuration file
3. Modify the code"
Then execute the necessary tools.
You are running within a local, privacy-first workspace. Ensure all actions are helpful and concise.`;
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-background">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <AppLogo size={32} animated={false} />
          <div>
            <h1 className="text-2xl font-bold text-foreground">AI Context Debugger</h1>
            <p className="text-sm text-muted-foreground">Prompt Injection & Auto-Retrieval Visibility</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Simulating a Chat Turn */}
        <div className="space-y-6">
          <div className="bg-surface border border-border p-6 rounded-2xl">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <MessageSquare className="w-5 h-5 text-blue-400" /> Simulate Next Message
            </h2>
            <div className="space-y-4">
              <textarea 
                className="w-full bg-background border border-border rounded-lg p-3 text-sm h-24 focus:ring-1 focus:ring-primary outline-none resize-none"
                placeholder="Type what the user will say next... (e.g. 'What is my favorite database?')"
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
              />
              <Button onClick={simulateAutoInjection} disabled={loading} className="w-full">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Zap className="w-4 h-4 mr-2" /> Run Context Pipeline</>}
              </Button>
            </div>
          </div>

          <div className="bg-surface border border-border p-6 rounded-2xl">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-purple-400" /> Auto-Retrieved Memories
            </h2>
            {retrieved.length > 0 ? (
              <div className="space-y-3">
                {retrieved.map((m, i) => (
                  <div key={i} className="p-3 bg-background border border-border rounded-lg text-sm">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded">Confidence: {(m.score*100).toFixed(1)}%</span>
                      <span className="text-xs text-muted-foreground">{m.source}</span>
                    </div>
                    <p>{m.content}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No memories surpassed the 0.5 confidence threshold.</p>
            )}
          </div>
        </div>

        {/* Right: Final System Prompt */}
        <div className="bg-surface border border-border p-6 rounded-2xl flex flex-col h-[calc(100vh-8rem)]">
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <Terminal className="w-5 h-5 text-green-400" /> Final System Prompt
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            This is the exact string passed to the LLM model for generation based on the simulated input.
          </p>
          <div className="flex-1 bg-black/50 border border-border rounded-lg p-4 overflow-y-auto font-mono text-sm text-green-400/90 whitespace-pre-wrap">
            {getSystemPrompt()}
          </div>
        </div>
      </div>
    </div>
  );
}
