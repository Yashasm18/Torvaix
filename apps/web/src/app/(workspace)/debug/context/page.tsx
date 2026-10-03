"use client";

import { useState } from "react";
import { useActiveWorkspace } from "@/hooks/use-active-workspace";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Activity, CheckCircle2 } from "lucide-react";

interface Result {
  id: string;
  content: string;
  source: string;
  score: number;
  retrievalType?: "vector" | "keyword" | "hybrid_rrf";
}

/**
 * The agent's own numbers (see orchestrator.ts): a recall question ("what do you remember…")
 * gets the top 5 results, and an ordinary chat message gets the top 3 that score above 0.4.
 */
const RECALL_COUNT = 5;
const CHAT_COUNT = 3;
const CHAT_MIN_SCORE = 0.4;

const TYPE_LABEL: Record<string, string> = {
  vector: "Vector",
  keyword: "Keyword",
  hybrid_rrf: "Keyword + vector",
};

export default function RetrievalTesterPage() {
  const workspaceId = useActiveWorkspace().workspaceId ?? "";

  const [query, setQuery] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    const text = query.trim();
    if (!text) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/memory/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, query: text, topK: RECALL_COUNT }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResults(data.results ?? []);
      setAsked(text);
    } catch (e) {
      setError(`Couldn't run the search: ${e instanceof Error ? e.message : "unknown error"}`);
      setResults([]);
      setAsked(null);
    } finally {
      setLoading(false);
    }
  };

  const usedInChat = new Set(results.slice(0, CHAT_COUNT).filter((r) => r.score > CHAT_MIN_SCORE).map((r) => r.id));
  const recallBlock = results.map((r) => `[Score: ${r.score.toFixed(2)}] ${r.content}`).join("\n");

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="p-6 pb-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <Activity className="w-6 h-6 text-primary" />
          Retrieval tester
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Type a message to see which memories Torvaix would find for it. This runs the same search the
          agent uses. It doesn&apos;t call the model or save anything.
        </p>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <form
            className="bg-surface border border-border p-5 rounded-xl space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run();
            }}
          >
            <label htmlFor="retrieval-query" className="text-sm font-semibold text-foreground">
              Message
            </label>
            <textarea
              id="retrieval-query"
              className="w-full bg-background border border-border rounded-lg p-3 text-sm h-24 focus:ring-1 focus:ring-primary outline-none resize-none"
              placeholder="e.g. What is my favorite database?"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void run();
                }
              }}
            />
            <Button type="submit" disabled={loading || !query.trim()} className="w-full gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Search memories
            </Button>
            {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          </form>

          <div className="bg-surface border border-border p-5 rounded-xl">
            <h2 className="text-sm font-semibold text-foreground mb-3">
              {asked === null ? "Results" : `${results.length} ${results.length === 1 ? "memory" : "memories"} found`}
            </h2>
            {asked === null ? (
              <p className="text-sm text-muted-foreground">Results appear here after you search.</p>
            ) : results.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing matched. For a recall question the agent would fall back to your five most recent memories.
              </p>
            ) : (
              <ul className="space-y-2">
                {results.map((m) => (
                  <li key={m.id} className="p-3 bg-background border border-border rounded-lg text-sm">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5 text-xs">
                      <span className="font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">
                        score {m.score.toFixed(2)}
                      </span>
                      {m.retrievalType && (
                        <span className="text-muted-foreground">{TYPE_LABEL[m.retrievalType] ?? m.retrievalType}</span>
                      )}
                      {usedInChat.has(m.id) && (
                        <span className="flex items-center gap-1 text-green-400">
                          <CheckCircle2 className="w-3 h-3" /> used in normal chat
                        </span>
                      )}
                      <span className="ml-auto text-muted-foreground truncate max-w-[10rem]">{m.source}</span>
                    </div>
                    <p className="text-foreground break-words">{m.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-surface border border-border p-5 rounded-xl text-sm">
            <h2 className="font-semibold text-foreground mb-3">How the agent uses these</h2>
            <ul className="space-y-2 text-muted-foreground list-disc pl-5">
              <li>
                <span className="text-foreground">Recall questions</span> (&ldquo;what do you remember about…&rdquo;) get
                the top {RECALL_COUNT} results, whatever their score.
              </li>
              <li>
                <span className="text-foreground">Ordinary messages</span> get at most {CHAT_COUNT} results, and only
                those scoring above {CHAT_MIN_SCORE}. They are marked &ldquo;used in normal chat&rdquo;.
              </li>
              <li>
                Scores come from keyword matching, plus vector similarity when Qdrant and an embedding model are
                running.
              </li>
            </ul>
          </div>

          <div className="bg-surface border border-border p-5 rounded-xl flex flex-col">
            <h2 className="text-sm font-semibold text-foreground mb-1">Memory text given to the model</h2>
            <p className="text-xs text-muted-foreground mb-3">
              For a recall question, the agent adds the memories to its prompt in this form. The rest of the prompt
              (Torvaix&apos;s instructions and your message) isn&apos;t shown here.
            </p>
            <pre className="min-h-[8rem] max-h-80 overflow-auto bg-background border border-border rounded-lg p-3 font-mono text-xs text-foreground whitespace-pre-wrap break-words">
              {asked === null ? "Search to see the memory text." : recallBlock || "No relevant memories found."}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
