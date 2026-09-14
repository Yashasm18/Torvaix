"use client";

import { useState, useEffect, useCallback } from "react";
import { useActiveWorkspace } from "@/hooks/use-active-workspace";
import { parseServerTimestamp } from "@/lib/server-time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Search, Plus, Trash2, Edit2, Database } from "lucide-react";
import { AppLogo } from "@/components/ui/app-logo";

interface MemoryRow {
  id: string;
  content: string;
  source: string;
  createdAt: string;
  lastAccessedAt: string;
  retrievalCount: number;
}

interface QueryResult {
  id: string;
  content: string;
  source: string;
  score: number;
}

async function requestJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

function formatTime(value: string) {
  return parseServerTimestamp(value)?.toLocaleString() ?? "—";
}

export default function MemoryDebugPage() {
  const workspaceId = useActiveWorkspace().workspaceId;

  const [memories, setMemories] = useState<MemoryRow[]>([]);
  const [searchResults, setSearchResults] = useState<QueryResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [storeContent, setStoreContent] = useState("");
  const [storeSource, setStoreSource] = useState("");

  const [searchQuery, setSearchQuery] = useState("");

  const [updateId, setUpdateId] = useState("");
  const [updateContent, setUpdateContent] = useState("");

  /** Run a request with the shared loading/error state; returns false when it failed. */
  const run = useCallback(async (task: () => Promise<void>) => {
    setLoading(true);
    try {
      await task();
      setError(null);
      return true;
    } catch (e: any) {
      setError(e.message || "Request failed");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAllMemories = useCallback(async () => {
    if (!workspaceId) return;
    await run(async () => {
      const data = await requestJson(`/api/memory?workspaceId=${encodeURIComponent(workspaceId)}`);
      setMemories(data.memories ?? []);
    });
  }, [workspaceId, run]);

  useEffect(() => {
    loadAllMemories();
  }, [loadAllMemories]);

  const handleStore = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run(() =>
      requestJson("/api/memory", jsonInit("POST", { workspaceId, content: storeContent, source: storeSource || "Memory Inspector" }))
    );
    if (ok) {
      setStoreContent("");
      setStoreSource("");
      await loadAllMemories();
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await run(async () => {
      const data = await requestJson("/api/memory/query", jsonInit("POST", { workspaceId, query: searchQuery, topK: 5 }));
      setSearchResults(data.results ?? []);
    });
  };

  const handleDelete = async (id: string) => {
    if (await run(() => requestJson(`/api/memory/${encodeURIComponent(id)}`, { method: "DELETE" }))) {
      await loadAllMemories();
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run(() =>
      requestJson(`/api/memory/${encodeURIComponent(updateId.trim())}`, jsonInit("PUT", { content: updateContent }))
    );
    if (ok) {
      setUpdateId("");
      setUpdateContent("");
      await loadAllMemories();
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-background">
      <div className="flex items-center gap-3 mb-8">
        <AppLogo size={32} animated={false} />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Memory Inspector</h1>
          <p className="text-sm text-muted-foreground">Inspect and edit the agent server&apos;s memory store for this workspace</p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-sm text-red-400">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Left Column: Actions */}
        <div className="space-y-8">

          {/* Store Memory */}
          <div className="bg-surface border border-border p-6 rounded-2xl">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <Plus className="w-5 h-5 text-primary" /> Store Memory
            </h2>
            <form onSubmit={handleStore} className="space-y-4">
              <Textarea
                placeholder="Memory content..."
                value={storeContent}
                onChange={e => setStoreContent(e.target.value)}
                required
                className="bg-background border-border"
              />
              <Input
                placeholder="Source (e.g., Conversation #12)"
                value={storeSource}
                onChange={e => setStoreSource(e.target.value)}
                className="bg-background border-border"
              />
              <Button type="submit" disabled={loading || !workspaceId} className="w-full">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Store"}
              </Button>
            </form>
          </div>

          {/* Search Memory */}
          <div className="bg-surface border border-border p-6 rounded-2xl">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <Search className="w-5 h-5 text-blue-400" /> Search Memory
            </h2>
            <form onSubmit={handleSearch} className="space-y-4">
              <Input
                placeholder="Query..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                required
                className="bg-background border-border"
              />
              <Button type="submit" variant="secondary" disabled={loading || !workspaceId} className="w-full bg-blue-500/10 text-blue-400 hover:bg-blue-500/20">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Hybrid Search"}
              </Button>
            </form>

            {searchResults.length > 0 && (
              <div className="mt-4 space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground">Results:</h3>
                {searchResults.map((res) => (
                  <div key={res.id} className="p-3 bg-background border border-border rounded-lg text-sm">
                    <p className="text-foreground">{res.content}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>Score: {(res.score * 100).toFixed(1)}%</span>
                      <span>Source: {res.source}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Update Memory */}
          <div className="bg-surface border border-border p-6 rounded-2xl">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <Edit2 className="w-5 h-5 text-orange-400" /> Update Memory
            </h2>
            <form onSubmit={handleUpdate} className="space-y-4">
              <Input
                placeholder="Memory ID (click the edit icon on a memory)"
                value={updateId}
                onChange={e => setUpdateId(e.target.value)}
                required
                className="bg-background border-border font-mono text-xs"
              />
              <Textarea
                placeholder="New content..."
                value={updateContent}
                onChange={e => setUpdateContent(e.target.value)}
                required
                className="bg-background border-border"
              />
              <Button type="submit" variant="secondary" disabled={loading} className="w-full bg-orange-500/10 text-orange-400 hover:bg-orange-500/20">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Update"}
              </Button>
            </form>
          </div>

        </div>

        {/* Right Column: Database List */}
        <div className="bg-surface border border-border p-6 rounded-2xl flex flex-col h-[calc(100vh-8rem)]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Database className="w-5 h-5 text-purple-400" /> All Memories ({memories.length})
            </h2>
            <Button variant="ghost" size="sm" onClick={loadAllMemories} disabled={loading}>
              Refresh
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-2">
            {memories.map((m) => (
              <div key={m.id} className="p-4 bg-background border border-border rounded-lg relative group">
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex gap-2">
                  <Button variant="ghost" size="icon" aria-label="Edit memory" className="h-8 w-8 text-muted-foreground" onClick={() => {
                    setUpdateId(m.id);
                    setUpdateContent(m.content);
                  }}>
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Delete memory" className="h-8 w-8 text-red-400 hover:text-red-500 hover:bg-red-500/10" onClick={() => handleDelete(m.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                <p className="text-sm text-foreground pr-20">{m.content}</p>

                <div className="grid grid-cols-2 gap-2 mt-4 text-xs font-mono text-muted-foreground bg-surface/50 p-2 rounded">
                  <div><span className="opacity-50">ID:</span> {m.id.substring(0, 8)}...</div>
                  <div className="truncate"><span className="opacity-50">Source:</span> {m.source}</div>
                  <div><span className="opacity-50">Created:</span> {formatTime(m.createdAt)}</div>
                  <div><span className="opacity-50">Accessed:</span> {formatTime(m.lastAccessedAt)}</div>
                  <div className="col-span-2"><span className="opacity-50">Retrieved:</span> {m.retrievalCount} times</div>
                </div>
              </div>
            ))}

            {memories.length === 0 && !loading && (
              <div className="text-center text-muted-foreground py-10">
                No memories stored in this workspace.
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
