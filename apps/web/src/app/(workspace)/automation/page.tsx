"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap,
  Plus,
  Clock,
  Play,
  Pause,
  Trash2,
  Calendar,
  Repeat,
  ArrowRight,
  GitBranch,
  RefreshCw,
  Search,
  Activity,
  CheckCircle2,
  AlertCircle,
  Cpu,
  Layers,
  Sparkles,
  Terminal,
  FileText,
  Filter,
  Flame,
  Radio,
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

interface TriggerConfig {
  frequency?: "interval" | "hourly" | "daily" | "weekly";
  intervalMinutes?: number;
  timeOfDay?: string;
  dayOfWeek?: number;
  eventName?: string;
  filterPattern?: string;
}

interface ActionConfig {
  prompt?: string;
  toolName?: string;
  decayThreshold?: number;
}

interface Automation {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  triggerType: "schedule" | "event" | "manual";
  triggerConfig: TriggerConfig;
  actionType: "agent_task" | "consolidate_memory" | "synthesize_graph" | "clean_stale_memories" | "mcp_tool";
  actionConfig: ActionConfig;
  status: "active" | "paused" | "draft";
  lastRunAt?: string | null;
  runCount: number;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowLog {
  id: string;
  automationId: string;
  workspaceId: string;
  status: "running" | "success" | "error";
  output: string;
  durationMs: number;
  startedAt: string;
  completedAt?: string | null;
}

interface AutomationStats {
  totalAutomations: number;
  activeCount: number;
  pausedCount: number;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
}

const statusConfig: Record<string, { dot: string; text: string; label: string; badge: string }> = {
  active: {
    dot: "bg-emerald-500 animate-pulse",
    text: "text-emerald-400",
    label: "Active",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  },
  paused: {
    dot: "bg-amber-500",
    text: "text-amber-400",
    label: "Paused",
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  },
  draft: {
    dot: "bg-slate-500",
    text: "text-muted-foreground",
    label: "Draft",
    badge: "border-slate-500/30 bg-slate-500/10 text-slate-400",
  },
};

const actionLabels: Record<string, { label: string; icon: any; color: string }> = {
  consolidate_memory: { label: "Memory Consolidation", icon: Sparkles, color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
  synthesize_graph: { label: "Graph Indexer", icon: GitBranch, color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20" },
  agent_task: { label: "Autonomous Agent Task", icon: Cpu, color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  clean_stale_memories: { label: "Stale Memory Cleanup", icon: Trash2, color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  mcp_tool: { label: "MCP Tool Execution", icon: Terminal, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
};

export default function AutomationPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [stats, setStats] = useState<AutomationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "schedule" | "event" | "manual">("all");

  // Triggering state
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [lastExecutionResult, setLastExecutionResult] = useState<{ id: string; output: string; status: string } | null>(null);

  // Logs Modal
  const [selectedWorkflowForLogs, setSelectedWorkflowForLogs] = useState<Automation | null>(null);
  const [logs, setLogs] = useState<WorkflowLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newTriggerType, setNewTriggerType] = useState<"schedule" | "event" | "manual">("schedule");
  const [newScheduleFreq, setNewScheduleFreq] = useState<"interval" | "hourly" | "daily" | "weekly">("daily");
  const [newIntervalMins, setNewIntervalMins] = useState(60);
  const [newTimeOfDay, setNewTimeOfDay] = useState("09:00");
  const [newEventName, setNewEventName] = useState("MEMORY_CREATED");
  const [newFilterPattern, setNewFilterPattern] = useState("");
  const [newActionType, setNewActionType] = useState<"agent_task" | "consolidate_memory" | "synthesize_graph" | "clean_stale_memories">("agent_task");
  const [newPrompt, setNewPrompt] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchAutomations = async () => {
    try {
      setLoading(true);
      const [autoRes, statsRes] = await Promise.all([
        fetch("/api/automations?workspaceId=default"),
        fetch("/api/automations/stats?workspaceId=default"),
      ]);

      if (autoRes.ok) {
        const autoData = await autoRes.json();
        if (autoData.automations) {
          setAutomations(autoData.automations);
        }
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        if (statsData.stats) {
          setStats(statsData.stats);
        }
      }
    } catch (err) {
      console.error("Failed to load automations:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAutomations();
  }, []);

  const handleToggleStatus = async (automation: Automation) => {
    const nextStatus = automation.status === "active" ? "paused" : "active";
    try {
      const res = await fetch(`/api/automations/${automation.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        setAutomations(prev =>
          prev.map(a => (a.id === automation.id ? { ...a, status: nextStatus } : a))
        );
        fetchAutomations();
      }
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this automation workflow?")) return;
    try {
      const res = await fetch(`/api/automations/${id}`, { method: "DELETE" });
      if (res.ok) {
        setAutomations(prev => prev.filter(a => a.id !== id));
        fetchAutomations();
      }
    } catch (err) {
      console.error("Failed to delete automation:", err);
    }
  };

  const handleRunNow = async (automation: Automation) => {
    try {
      setTriggeringId(automation.id);
      setLastExecutionResult(null);
      const res = await fetch(`/api/automations/${automation.id}/trigger`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok && data.log) {
        setLastExecutionResult({
          id: automation.id,
          output: data.log.output,
          status: data.log.status,
        });
        fetchAutomations();
      }
    } catch (err) {
      console.error("Failed to trigger automation:", err);
    } finally {
      setTriggeringId(null);
    }
  };

  const handleOpenLogs = async (automation: Automation) => {
    setSelectedWorkflowForLogs(automation);
    try {
      setLogsLoading(true);
      const res = await fetch(`/api/automations/${automation.id}/logs?limit=25`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (err) {
      console.error("Failed to fetch logs:", err);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleCreateAutomation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    try {
      setCreating(true);
      const triggerConfig: TriggerConfig = {};
      if (newTriggerType === "schedule") {
        triggerConfig.frequency = newScheduleFreq;
        if (newScheduleFreq === "interval") triggerConfig.intervalMinutes = Number(newIntervalMins);
        if (newScheduleFreq === "daily" || newScheduleFreq === "weekly") triggerConfig.timeOfDay = newTimeOfDay;
      } else if (newTriggerType === "event") {
        triggerConfig.eventName = newEventName;
        if (newFilterPattern.trim()) triggerConfig.filterPattern = newFilterPattern.trim();
      }

      const actionConfig: ActionConfig = {};
      if (newActionType === "agent_task") {
        actionConfig.prompt = newPrompt;
      }

      const res = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: "default",
          name: newName.trim(),
          description: newDescription.trim(),
          triggerType: newTriggerType,
          triggerConfig,
          actionType: newActionType,
          actionConfig,
          status: "active",
        }),
      });

      if (res.ok) {
        setIsCreateOpen(false);
        setNewName("");
        setNewDescription("");
        setNewPrompt("");
        fetchAutomations();
      }
    } catch (err) {
      console.error("Failed to create automation:", err);
    } finally {
      setCreating(false);
    }
  };

  const filteredAutomations = automations.filter(a => {
    const matchesFilter = filterType === "all" || a.triggerType === filterType;
    const matchesSearch =
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const formatTriggerLabel = (a: Automation) => {
    if (a.triggerType === "manual") return "Manual / On-Demand";
    if (a.triggerType === "event") {
      return `Event: ${a.triggerConfig?.eventName || "Event"}${a.triggerConfig?.filterPattern ? ` ("${a.triggerConfig.filterPattern}")` : ""}`;
    }
    const freq = a.triggerConfig?.frequency || "interval";
    if (freq === "interval") return `Interval: Every ${a.triggerConfig?.intervalMinutes || 60}m`;
    if (freq === "hourly") return "Hourly Trigger";
    if (freq === "daily") return `Daily at ${a.triggerConfig?.timeOfDay || "09:00"}`;
    if (freq === "weekly") return `Weekly at ${a.triggerConfig?.timeOfDay || "02:00"}`;
    return "Scheduled Trigger";
  };

  const successRate =
    stats && stats.totalRuns > 0
      ? Math.round((stats.successfulRuns / stats.totalRuns) * 100)
      : 100;

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-y-auto">
      {/* Top Banner Header */}
      <motion.div
        className="p-6 pb-2 border-b border-border/40 bg-surface/30"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Autonomous Background Automation
              </h1>
              <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-primary/10 border border-primary/20 text-primary">
                Engine Active
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Event-driven automations, scheduled background tasks, and agent workflow orchestration.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchAutomations}
              disabled={loading}
              className="gap-1.5 border-border hover:bg-surface"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Sync
            </Button>

            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger
                render={
                  <Button className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 rounded-lg shadow-sm">
                    <Plus className="w-4 h-4" />
                    New Automation
                  </Button>
                }
              />
              <DialogContent className="max-w-xl bg-surface border-border">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold">Create Autonomous Workflow</DialogTitle>
                  <DialogDescription>
                    Configure an autonomous agent workflow triggered by schedules, events, or on-demand execution.
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleCreateAutomation} className="space-y-4 pt-2">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Workflow Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Nightly Knowledge Graph Indexer"
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      className="w-full mt-1.5 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</label>
                    <textarea
                      placeholder="Explain what this automation accomplishes..."
                      value={newDescription}
                      onChange={e => setNewDescription(e.target.value)}
                      rows={2}
                      className="w-full mt-1.5 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Trigger Type</label>
                      <select
                        value={newTriggerType}
                        onChange={e => setNewTriggerType(e.target.value as any)}
                        className="w-full mt-1.5 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                      >
                        <option value="schedule">Schedule (Time/Interval)</option>
                        <option value="event">Event-Driven (Event Bus)</option>
                        <option value="manual">Manual / On-Demand</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Action Type</label>
                      <select
                        value={newActionType}
                        onChange={e => setNewActionType(e.target.value as any)}
                        className="w-full mt-1.5 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                      >
                        <option value="consolidate_memory">Memory Consolidation</option>
                        <option value="synthesize_graph">Knowledge Graph Indexer</option>
                        <option value="agent_task">Autonomous Agent Task</option>
                        <option value="clean_stale_memories">Stale Memory Cleanup</option>
                      </select>
                    </div>
                  </div>

                  {/* Dynamic Trigger Config */}
                  {newTriggerType === "schedule" && (
                    <div className="p-3.5 rounded-lg border border-border/60 bg-background/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Frequency</span>
                        <div className="flex gap-1.5">
                          {(["interval", "hourly", "daily", "weekly"] as const).map(freq => (
                            <button
                              key={freq}
                              type="button"
                              onClick={() => setNewScheduleFreq(freq)}
                              className={`px-2.5 py-1 rounded text-xs capitalize transition-colors ${
                                newScheduleFreq === freq
                                  ? "bg-primary text-primary-foreground font-semibold"
                                  : "bg-surface text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              {freq}
                            </button>
                          ))}
                        </div>
                      </div>

                      {newScheduleFreq === "interval" && (
                        <div>
                          <label className="text-xs text-muted-foreground">Interval (minutes)</label>
                          <input
                            type="number"
                            min={1}
                            max={10080}
                            value={newIntervalMins}
                            onChange={e => setNewIntervalMins(Number(e.target.value))}
                            className="w-full mt-1 px-3 py-1.5 bg-background border border-border rounded-md text-sm text-foreground"
                          />
                        </div>
                      )}

                      {(newScheduleFreq === "daily" || newScheduleFreq === "weekly") && (
                        <div>
                          <label className="text-xs text-muted-foreground">Target Time (24h format)</label>
                          <input
                            type="time"
                            value={newTimeOfDay}
                            onChange={e => setNewTimeOfDay(e.target.value)}
                            className="w-full mt-1 px-3 py-1.5 bg-background border border-border rounded-md text-sm text-foreground"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {newTriggerType === "event" && (
                    <div className="p-3.5 rounded-lg border border-border/60 bg-background/50 space-y-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Bus Event Trigger</label>
                        <select
                          value={newEventName}
                          onChange={e => setNewEventName(e.target.value)}
                          className="w-full mt-1.5 px-3 py-1.5 bg-background border border-border rounded-md text-sm text-foreground"
                        >
                          <option value="MEMORY_CREATED">MEMORY_CREATED (When new memory stored)</option>
                          <option value="TASK_COMPLETED">TASK_COMPLETED (When agent task finishes)</option>
                          <option value="AGENT_FINISHED">AGENT_FINISHED (Agent execution complete)</option>
                          <option value="MEMORY_DELETED">MEMORY_DELETED (When memory pruned)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Filter Pattern / Keyword (Optional)</label>
                        <input
                          type="text"
                          placeholder="e.g., React, TypeScript, Architecture"
                          value={newFilterPattern}
                          onChange={e => setNewFilterPattern(e.target.value)}
                          className="w-full mt-1 px-3 py-1.5 bg-background border border-border rounded-md text-sm text-foreground"
                        />
                      </div>
                    </div>
                  )}

                  {/* Agent Task prompt input */}
                  {newActionType === "agent_task" && (
                    <div>
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Agent Task Prompt</label>
                      <textarea
                        required
                        placeholder="What autonomous task should the agent execute when triggered?"
                        value={newPrompt}
                        onChange={e => setNewPrompt(e.target.value)}
                        rows={3}
                        className="w-full mt-1.5 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground"
                      />
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
                    <Button type="button" variant="ghost" onClick={() => setIsCreateOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={creating} className="bg-primary text-primary-foreground">
                      {creating ? "Deploying..." : "Deploy Automation"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Real-time Operation Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 mb-2">
          <div className="bg-surface border border-border/60 rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Workflows</p>
              <p className="text-xl font-bold text-foreground mt-0.5">{stats?.totalAutomations || automations.length}</p>
            </div>
            <div className="p-2.5 rounded-lg bg-primary/10 text-primary border border-primary/20">
              <Zap className="w-4 h-4" />
            </div>
          </div>

          <div className="bg-surface border border-border/60 rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Active Loops</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <p className="text-xl font-bold text-emerald-400">{stats?.activeCount ?? automations.filter(a => a.status === "active").length}</p>
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Radio className="w-4 h-4" />
            </div>
          </div>

          <div className="bg-surface border border-border/60 rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total Executions</p>
              <p className="text-xl font-bold text-foreground mt-0.5">{stats?.totalRuns || automations.reduce((acc, a) => acc + (a.runCount || 0), 0)}</p>
            </div>
            <div className="p-2.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Repeat className="w-4 h-4" />
            </div>
          </div>

          <div className="bg-surface border border-border/60 rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Success Rate</p>
              <p className="text-xl font-bold text-emerald-400 mt-0.5">{successRate}%</p>
            </div>
            <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Execution Feedback Notification Banner */}
      <AnimatePresence>
        {lastExecutionResult && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mx-6 mt-4 p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-emerald-200 flex items-start justify-between gap-3 shadow-lg"
          >
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-sm text-emerald-300">Automation Triggered Successfully</p>
                <p className="text-xs text-emerald-200/80 mt-1 font-mono">{lastExecutionResult.output}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLastExecutionResult(null)}
              className="text-xs text-emerald-400 hover:bg-emerald-500/10 h-7"
            >
              Dismiss
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter and Search Bar */}
      <div className="px-6 pt-5 pb-2 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 bg-surface/70 border border-border/60 rounded-lg p-1 w-full sm:w-auto">
          {(
            [
              { id: "all", label: "All Triggers" },
              { id: "schedule", label: "Scheduled" },
              { id: "event", label: "Event-Driven" },
              { id: "manual", label: "On-Demand" },
            ] as const
          ).map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                filterType === tab.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search automations..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-surface/80 border border-border/60 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground"
          />
        </div>
      </div>

      {/* Automations List */}
      <div className="flex-1 px-6 pb-8 pt-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
            <RefreshCw className="w-7 h-7 animate-spin text-primary" />
            <p className="text-sm">Connecting to autonomous engine...</p>
          </div>
        ) : filteredAutomations.length === 0 ? (
          <div className="bg-surface/50 border border-border rounded-xl p-12 text-center flex flex-col items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-muted-foreground">
              <Zap className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-foreground">No automations found</h3>
            <p className="text-xs text-muted-foreground max-w-sm">
              {searchQuery ? "No workflows match your search query." : "Deploy your first autonomous workflow to automate workspace operations."}
            </p>
            <Button onClick={() => setIsCreateOpen(true)} className="mt-2 bg-primary text-primary-foreground gap-1.5 text-xs">
              <Plus className="w-3.5 h-3.5" />
              Create Automation
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filteredAutomations.map((automation, index) => {
              const status = statusConfig[automation.status] || statusConfig.active;
              const actionMeta = actionLabels[automation.actionType] || {
                label: automation.actionType,
                icon: Zap,
                color: "text-slate-400 bg-slate-500/10 border-slate-500/20",
              };
              const ActionIcon = actionMeta.icon;
              const isTriggering = triggeringId === automation.id;

              return (
                <motion.div
                  key={automation.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05, duration: 0.25 }}
                  className="bg-surface border border-border rounded-xl p-5 hover:border-primary/40 transition-all duration-200 shadow-sm group"
                >
                  {/* Top Row */}
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-start gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 group-hover:scale-105 transition-transform">
                        <Zap className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                            {automation.name}
                          </h3>
                          <div className={`px-2 py-0.5 rounded-full text-[11px] font-mono border ${status.badge} flex items-center gap-1.5`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                            {status.label}
                          </div>
                          <div className={`px-2 py-0.5 rounded-full text-[11px] font-mono border ${actionMeta.color} flex items-center gap-1`}>
                            <ActionIcon className="w-3 h-3" />
                            {actionMeta.label}
                          </div>
                        </div>

                        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                          {automation.description || "Autonomous workflow for workspace operations."}
                        </p>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRunNow(automation)}
                        disabled={isTriggering}
                        className="h-8 gap-1.5 text-xs border-border hover:border-primary/40 hover:bg-primary/5 text-foreground"
                      >
                        {isTriggering ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" />
                        ) : (
                          <Play className="w-3.5 h-3.5 text-emerald-400" />
                        )}
                        <span>{isTriggering ? "Running..." : "Run Now"}</span>
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenLogs(automation)}
                        className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Logs</span>
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggleStatus(automation)}
                        title={automation.status === "active" ? "Pause Automation" : "Resume Automation"}
                        className="h-8 w-8 text-muted-foreground hover:text-amber-400"
                      >
                        {automation.status === "active" ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(automation.id)}
                        title="Delete Automation"
                        className="h-8 w-8 text-muted-foreground hover:text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Footer Meta */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-3 border-t border-border/50 gap-2 mt-2">
                    <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1.5 font-mono text-[11px]">
                        <Calendar className="w-3.5 h-3.5 text-primary/70" />
                        {formatTriggerLabel(automation)}
                      </span>
                      {automation.actionConfig?.prompt && (
                        <span className="flex items-center gap-1.5 text-[11px] truncate max-w-xs" title={automation.actionConfig.prompt}>
                          <Terminal className="w-3.5 h-3.5 text-cyan-400/70" />
                          Prompt: &quot;{automation.actionConfig.prompt}&quot;
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1 font-mono text-[11px]">
                        <Repeat className="w-3 h-3 text-muted-foreground" />
                        {automation.runCount || 0} runs
                      </span>
                      <span className="flex items-center gap-1 text-[11px]">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        Last Run: {automation.lastRunAt ? new Date(automation.lastRunAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Never"}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Execution Logs Drawer / Modal */}
      <Dialog open={!!selectedWorkflowForLogs} onOpenChange={open => !open && setSelectedWorkflowForLogs(null)}>
        <DialogContent className="max-w-2xl bg-surface border-border max-h-[85vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              <DialogTitle className="text-lg font-bold">Execution History: {selectedWorkflowForLogs?.name}</DialogTitle>
            </div>
            <DialogDescription>
              Audit trail of background runs and execution outputs.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-1 space-y-3 py-2">
            {logsLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <RefreshCw className="w-6 h-6 animate-spin text-primary" />
                <span className="text-xs">Loading execution logs...</span>
              </div>
            ) : logs.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <p className="text-sm">No execution logs recorded yet.</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Run the workflow or wait for the scheduler to trigger it.</p>
              </div>
            ) : (
              logs.map(log => (
                <div
                  key={log.id}
                  className={`p-3.5 rounded-lg border text-xs font-mono transition-all ${
                    log.status === "success"
                      ? "border-emerald-500/30 bg-emerald-950/10 text-foreground"
                      : "border-red-500/30 bg-red-950/10 text-foreground"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          log.status === "success"
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : "bg-red-500/20 text-red-400 border border-red-500/30"
                        }`}
                      >
                        {log.status}
                      </span>
                      <span className="text-muted-foreground">{new Date(log.startedAt).toLocaleString()}</span>
                    </div>
                    <span className="text-muted-foreground">{log.durationMs}ms</span>
                  </div>
                  <pre className="p-2.5 rounded bg-background/80 border border-border/50 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted-foreground">
                    {log.output || "No output recorded."}
                  </pre>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
