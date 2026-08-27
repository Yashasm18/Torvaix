"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen,
  Search,
  FileText,
  Tag,
  Clock,
  Brain,
  Plus,
  Filter,
  Layers,
  Sparkles,
  RefreshCw,
  Trash2,
  Cpu,
  CheckCircle2,
  TrendingUp,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface MemoryItem {
  id: string;
  workspaceId: string;
  source: string;
  content: string;
  createdAt: string;
  lastAccessedAt?: string;
  retrievalCount?: number;
}

interface MemoryInsight {
  id: string;
  category: string;
  title: string;
  summary: string;
  supportingMemoryIds: string[];
  importance: number;
  actionable: boolean;
  tags: string[];
  createdAt: string;
}

interface HealthMetrics {
  totalMemories: number;
  consolidatedRatio: number;
  avgAccessCount: number;
  staleMemoryCount: number;
  recencyScore: number;
  consolidationStatus: string;
}

const typeColors: Record<string, string> = {
  architecture: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  tech_stack: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  preference: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  task: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  domain_knowledge: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  general: "text-slate-400 bg-slate-500/10 border-slate-500/20",
};

export default function KnowledgePage() {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [insights, setInsights] = useState<MemoryInsight[]>([]);
  const [health, setHealth] = useState<HealthMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [consolidating, setConsolidating] = useState(false);
  const [consolidationReport, setConsolidationReport] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"memories" | "insights">("memories");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // New Memory modal state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [newSource, setNewSource] = useState("Manual Entry");
  const [submitting, setSubmitting] = useState(false);

  const fetchKnowledge = async () => {
    try {
      setLoading(true);
      const [memRes, insightRes] = await Promise.all([
        fetch("/api/memory?workspaceId=default"),
        fetch("/api/memory/insights?workspaceId=default"),
      ]);

      if (memRes.ok) {
        const memData = await memRes.json();
        if (memData.memories) {
          setMemories(memData.memories);
        }
      }

      if (insightRes.ok) {
        const insData = await insightRes.json();
        if (insData.insights) {
          setInsights(insData.insights);
        }
        if (insData.health) {
          setHealth(insData.health);
        }
      }
    } catch (e) {
      console.error("Failed to load knowledge:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKnowledge();
  }, []);

  const handleConsolidate = async () => {
    try {
      setConsolidating(true);
      setConsolidationReport(null);
      const res = await fetch("/api/memory/consolidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: "default" }),
      });

      if (res.ok) {
        const data = await res.json();
        const rep = data.report;
        setConsolidationReport(
          `Consolidation complete: ${rep.processedCount} memories analyzed into ${rep.clustersCount} semantic clusters. Formed ${rep.synthesizedInsights.length} high-order insights & reinforced ${rep.reinforcedEdgesCount} graph edges!`
        );
        await fetchKnowledge();
      }
    } catch (e) {
      console.error("Consolidation failed:", e);
    } finally {
      setConsolidating(false);
    }
  };

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;

    try {
      setSubmitting(true);
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: "default",
          content: newContent.trim(),
          source: newSource.trim() || "Manual Entry",
        }),
      });

      if (res.ok) {
        setNewContent("");
        setIsAddOpen(false);
        await fetchKnowledge();
      }
    } catch (e) {
      console.error("Add memory failed:", e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteMemory = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/memory?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setMemories((prev) => prev.filter((m) => m.id !== id));
        fetchKnowledge();
      }
    } catch (e) {
      console.error("Delete memory failed:", e);
    }
  };

  // Filtering
  const filteredMemories = memories.filter((item) => {
    const matchesSearch =
      item.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.source.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const filteredInsights = insights.filter((ins) => {
    const matchesSearch =
      ins.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ins.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ins.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCat =
      selectedCategory === "all" || ins.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-y-auto">
      {/* Header */}
      <motion.div
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-6 pb-2 gap-4"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Brain className="w-6 h-6 text-primary" />
            Knowledge Base
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Autonomous memory consolidation and synthesized workspace intelligence.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={fetchKnowledge}
            disabled={loading}
            className="gap-2 rounded-lg border-border text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            variant="secondary"
            onClick={handleConsolidate}
            disabled={consolidating || memories.length === 0}
            className="gap-2 rounded-lg border border-primary/20 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          >
            <Sparkles className={`w-4 h-4 ${consolidating ? "animate-spin" : ""}`} />
            {consolidating ? "Consolidating..." : "Consolidate Memory"}
          </Button>

          <Button
            onClick={() => setIsAddOpen(true)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 rounded-lg"
          >
            <Plus className="w-4 h-4" />
            Add Knowledge
          </Button>

          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogContent className="sm:max-w-[480px] bg-surface border-border">
              <DialogHeader>
                <DialogTitle className="text-foreground flex items-center gap-2">
                  <Brain className="w-5 h-5 text-primary" />
                  Add Memory to Workspace
                </DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Store a permanent fact, architecture pattern, or preference. It will be
                  persisted in SQLite & vectorized in Qdrant.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAddMemory} className="space-y-4 pt-2">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                    Content
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    placeholder="e.g. The database uses better-sqlite3 with WAL mode enabled for local concurrency..."
                    className="w-full bg-background border border-border rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                    Source
                  </label>
                  <input
                    type="text"
                    value={newSource}
                    onChange={(e) => setNewSource(e.target.value)}
                    placeholder="e.g. Architecture Note, User Prompt, Config"
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsAddOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting} className="bg-primary">
                    {submitting ? "Saving..." : "Save Memory"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </motion.div>

      {/* Intelligence Health Stats */}
      <div className="px-6 pt-4 pb-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-surface/80 border border-border/80 rounded-xl p-4 flex flex-col">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5 font-mono">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              Total Memories
            </span>
            <span className="text-2xl font-bold text-foreground mt-1">
              {memories.length}
            </span>
          </div>

          <div className="bg-surface/80 border border-border/80 rounded-xl p-4 flex flex-col">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5 font-mono">
              <Cpu className="w-3.5 h-3.5 text-primary" />
              Synthesized Insights
            </span>
            <span className="text-2xl font-bold text-foreground mt-1">
              {insights.length}
            </span>
          </div>

          <div className="bg-surface/80 border border-border/80 rounded-xl p-4 flex flex-col">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5 font-mono">
              <Activity className="w-3.5 h-3.5 text-purple-400" />
              Avg Retrievals
            </span>
            <span className="text-2xl font-bold text-foreground mt-1">
              {health?.avgAccessCount ?? 0}
            </span>
          </div>

          <div className="bg-surface/80 border border-border/80 rounded-xl p-4 flex flex-col">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5 font-mono">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              Retention Score
            </span>
            <span className="text-2xl font-bold text-emerald-400 mt-1">
              {health?.recencyScore ?? 100}%
            </span>
          </div>
        </div>
      </div>

      {/* Consolidation Success Banner */}
      <AnimatePresence>
        {consolidationReport && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mx-6 my-2 p-3.5 rounded-xl border border-primary/30 bg-primary/10 text-xs text-primary flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{consolidationReport}</span>
            </div>
            <button
              onClick={() => setConsolidationReport(null)}
              className="text-primary/70 hover:text-primary font-mono text-xs ml-3"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* View Switcher & Search Bar */}
      <div className="px-6 py-3 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex items-center gap-2 bg-surface/50 border border-border rounded-lg p-1">
          <button
            onClick={() => setActiveTab("memories")}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-all ${
              activeTab === "memories"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Stored Memories ({filteredMemories.length})
          </button>
          <button
            onClick={() => setActiveTab("insights")}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-all ${
              activeTab === "insights"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Executive Insights ({filteredInsights.length})
          </button>
        </div>

        <div className="flex-1 max-w-md flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-2 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/30 transition-all">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Search knowledge by text, source, tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 px-6 pb-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <RefreshCw className="w-6 h-6 animate-spin mb-2 text-primary" />
            <p className="text-sm">Loading workspace intelligence...</p>
          </div>
        ) : activeTab === "memories" ? (
          /* Memories List */
          <div className="flex flex-col gap-3">
            {filteredMemories.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-border rounded-xl">
                <Brain className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                <p className="text-sm text-muted-foreground">No memories found matching your search.</p>
                <Button
                  variant="link"
                  onClick={() => setIsAddOpen(true)}
                  className="text-primary text-xs mt-1"
                >
                  Create your first memory
                </Button>
              </div>
            ) : (
              <AnimatePresence>
                {filteredMemories.map((item, index) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ delay: Math.min(index * 0.03, 0.3), duration: 0.2 }}
                    className="bg-surface border border-border rounded-xl p-5 hover:border-primary/30 transition-all duration-200 group relative"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 text-primary bg-primary/10 border-primary/20">
                        <Brain className="w-4 h-4" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground leading-relaxed mb-3">
                          {item.content}
                        </p>
                        <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-muted-foreground">
                          <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1">
                              <Tag className="w-3 h-3 text-primary/70" />
                              {item.source}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(item.createdAt).toLocaleDateString()}
                            </span>
                            {item.retrievalCount !== undefined && item.retrievalCount > 0 && (
                              <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-mono text-[10px]">
                                {item.retrievalCount} recall{item.retrievalCount === 1 ? "" : "s"}
                              </span>
                            )}
                          </div>

                          <button
                            onClick={(e) => handleDeleteMemory(item.id, e)}
                            title="Delete memory"
                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-400 transition-all p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        ) : (
          /* Executive Insights List */
          <div className="flex flex-col gap-3">
            {filteredInsights.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-border rounded-xl">
                <Sparkles className="w-8 h-8 text-primary mx-auto mb-2 opacity-50" />
                <p className="text-sm text-muted-foreground">No synthesized insights yet.</p>
                <Button
                  variant="link"
                  onClick={handleConsolidate}
                  className="text-primary text-xs mt-1"
                >
                  Run memory consolidation now
                </Button>
              </div>
            ) : (
              <AnimatePresence>
                {filteredInsights.map((ins, index) => (
                  <motion.div
                    key={ins.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ delay: Math.min(index * 0.03, 0.3), duration: 0.2 }}
                    className="bg-surface border border-border rounded-xl p-5 hover:border-primary/30 transition-all duration-200"
                  >
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full border uppercase tracking-wider ${
                            typeColors[ins.category] || typeColors.general
                          }`}
                        >
                          {ins.category.replace("_", " ")}
                        </span>
                        <h3 className="font-semibold text-sm text-foreground">
                          {ins.title}
                        </h3>
                      </div>
                      <span className="text-xs font-mono text-primary font-semibold shrink-0">
                        Score: {ins.importance}/10
                      </span>
                    </div>

                    <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                      {ins.summary}
                    </p>

                    <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-border/50 text-xs">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {ins.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-muted text-muted-foreground font-mono"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                      <span className="text-muted-foreground text-[11px]">
                        Synthesized from {ins.supportingMemoryIds.length} source memories
                      </span>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
