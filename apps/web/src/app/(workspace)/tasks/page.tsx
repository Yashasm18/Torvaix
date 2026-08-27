"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  Filter,
  Shield,
  Terminal,
  Play,
  RotateCcw,
  Check,
  X,
  FileCode,
  Globe,
  Search,
  Copy,
  ChevronDown,
  ChevronUp,
  Cpu,
  RefreshCw,
  AlertTriangle,
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

interface ExecutionLog {
  id: string;
  workspaceId: string;
  action: string;
  params: string;
  result: string | null;
  status: "success" | "error" | string;
  createdAt: string;
}

interface PendingAction {
  id: string;
  workspaceId: string;
  action: string;
  params: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

const toolIcons: Record<string, React.ReactNode> = {
  bash: <Terminal className="w-4 h-4 text-amber-400" />,
  python: <FileCode className="w-4 h-4 text-blue-400" />,
  write_file: <FileCode className="w-4 h-4 text-emerald-400" />,
  read_file: <FileCode className="w-4 h-4 text-purple-400" />,
  repo_scan: <Cpu className="w-4 h-4 text-cyan-400" />,
  web_search: <Globe className="w-4 h-4 text-sky-400" />,
};

export default function TasksPage() {
  const [executions, setExecutions] = useState<ExecutionLog[]>([]);
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<"all" | "pending" | "success" | "error">("all");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Dispatch modal
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [dispatching, setDispatching] = useState(false);
  const [lastDispatchedOutput, setLastDispatchedOutput] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [execRes, pendingRes] = await Promise.all([
        fetch("/api/agent/executions?workspaceId=default&limit=60"),
        fetch("/api/agent/pending-actions?workspaceId=default&status=pending"),
      ]);

      if (execRes.ok) {
        const execData = await execRes.json();
        if (execData.logs) {
          setExecutions(execData.logs);
        }
      }

      if (pendingRes.ok) {
        const pendingData = await pendingRes.json();
        if (pendingData.actions) {
          setPendingActions(pendingData.actions);
        }
      }
    } catch (e) {
      console.error("Failed to fetch task execution data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8000); // 8-second auto polling
    return () => clearInterval(interval);
  }, []);

  const handleActionApproval = async (id: string, status: "approved" | "rejected") => {
    try {
      const res = await fetch("/api/agent/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingActionId: id, status }),
      });

      if (res.ok) {
        setPendingActions((prev) => prev.filter((a) => a.id !== id));
        fetchData();
      }
    } catch (e) {
      console.error("Approval error:", e);
    }
  };

  const handleDispatchTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instructions.trim()) return;

    try {
      setDispatching(true);
      setLastDispatchedOutput(null);

      const res = await fetch("/api/agent/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instructions: instructions.trim(),
          workspaceId: "default",
          priority,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setLastDispatchedOutput(data.task?.output || "Task initiated.");
        setInstructions("");
        await fetchData();
      }
    } catch (e) {
      console.error("Dispatch error:", e);
    } finally {
      setDispatching(false);
    }
  };

  const parseJsonSafe = (str: string) => {
    try {
      return JSON.parse(str);
    } catch {
      return str;
    }
  };

  const filteredLogs = executions.filter((log) => {
    const matchesSearch =
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.params.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.result && log.result.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;
    if (selectedFilter === "success") return log.status === "success";
    if (selectedFilter === "error") return log.status === "error";
    return true;
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
            <Terminal className="w-6 h-6 text-primary" />
            Task & Execution Operations
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time tool executions, audit logs, and gated security clearances.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={fetchData}
            disabled={loading}
            className="gap-2 rounded-lg border-border text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            onClick={() => setIsNewTaskOpen(true)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 rounded-lg"
          >
            <Play className="w-4 h-4" />
            Dispatch Task
          </Button>

          <Dialog open={isNewTaskOpen} onOpenChange={setIsNewTaskOpen}>
            <DialogContent className="sm:max-w-[500px] bg-surface border-border">
              <DialogHeader>
                <DialogTitle className="text-foreground flex items-center gap-2">
                  <Play className="w-5 h-5 text-primary" />
                  Dispatch Autonomous Task
                </DialogTitle>
                <DialogDescription className="text-muted-foreground">
                  Send execution instructions directly to the Torvaix State Graph Orchestrator.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleDispatchTask} className="space-y-4 pt-2">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                    Instructions / Prompt
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="e.g. Inspect the project directory, run repo_scan, or create a python script that tests memory..."
                    className="w-full bg-background border border-border rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                    Priority
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                  >
                    <option value="low">Low Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="high">High Priority (Urgent)</option>
                  </select>
                </div>

                {lastDispatchedOutput && (
                  <div className="p-3 bg-background border border-border rounded-lg text-xs font-mono text-foreground max-h-36 overflow-y-auto whitespace-pre-wrap">
                    {lastDispatchedOutput}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsNewTaskOpen(false)}
                  >
                    Close
                  </Button>
                  <Button type="submit" disabled={dispatching} className="bg-primary">
                    {dispatching ? "Executing..." : "Run Task"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </motion.div>

      {/* Gated Security Approvals Banner */}
      <div className="px-6 pt-4 pb-2">
        <AnimatePresence>
          {pendingActions.length > 0 ? (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-5 rounded-xl border border-amber-500/40 bg-amber-500/10 shadow-lg"
            >
              <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm mb-3">
                <Shield className="w-5 h-5 text-amber-400 animate-pulse" />
                <span>Security Clearance Required ({pendingActions.length} Pending)</span>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                The Execution Agent attempted an operation requiring human authorization.
                Review the command parameters below before approving execution.
              </p>

              <div className="flex flex-col gap-3">
                {pendingActions.map((action) => {
                  const paramsObj = parseJsonSafe(action.params);
                  const commandStr =
                    paramsObj.command || paramsObj.code || JSON.stringify(paramsObj, null, 2);

                  return (
                    <div
                      key={action.id}
                      className="bg-background/90 border border-amber-500/20 rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase">
                            {action.action}
                          </span>
                          <span className="text-xs text-muted-foreground font-mono">
                            ID: {action.id.slice(0, 8)}
                          </span>
                        </div>
                        <pre className="text-xs font-mono bg-surface p-2.5 rounded border border-border text-foreground overflow-x-auto">
                          {commandStr}
                        </pre>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => handleActionApproval(action.id, "approved")}
                          className="bg-green-600 hover:bg-green-500 text-white gap-1.5 rounded-lg text-xs"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleActionApproval(action.id, "rejected")}
                          className="gap-1.5 rounded-lg text-xs"
                        >
                          <X className="w-3.5 h-3.5" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* Execution Audit Metrics */}
      <div className="px-6 py-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-surface/80 border border-border/80 rounded-xl p-4 flex flex-col">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5 font-mono">
              <Terminal className="w-3.5 h-3.5 text-primary" />
              Total Tool Runs
            </span>
            <span className="text-2xl font-bold text-foreground mt-1">
              {executions.length}
            </span>
          </div>

          <div className="bg-surface/80 border border-border/80 rounded-xl p-4 flex flex-col">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5 font-mono">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
              Successful
            </span>
            <span className="text-2xl font-bold text-green-400 mt-1">
              {executions.filter((e) => e.status === "success").length}
            </span>
          </div>

          <div className="bg-surface/80 border border-border/80 rounded-xl p-4 flex flex-col">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5 font-mono">
              <AlertCircle className="w-3.5 h-3.5 text-red-400" />
              Errors
            </span>
            <span className="text-2xl font-bold text-red-400 mt-1">
              {executions.filter((e) => e.status === "error").length}
            </span>
          </div>

          <div className="bg-surface/80 border border-border/80 rounded-xl p-4 flex flex-col">
            <span className="text-xs text-muted-foreground flex items-center gap-1.5 font-mono">
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              Pending Gated
            </span>
            <span className="text-2xl font-bold text-amber-400 mt-1">
              {pendingActions.length}
            </span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="px-6 py-3 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex items-center gap-2 bg-surface/50 border border-border rounded-lg p-1">
          <button
            onClick={() => setSelectedFilter("all")}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-all ${
              selectedFilter === "all"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All Logs ({executions.length})
          </button>
          <button
            onClick={() => setSelectedFilter("success")}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-all ${
              selectedFilter === "success"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Success ({executions.filter((e) => e.status === "success").length})
          </button>
          <button
            onClick={() => setSelectedFilter("error")}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-all ${
              selectedFilter === "error"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Errors ({executions.filter((e) => e.status === "error").length})
          </button>
        </div>

        <div className="flex-1 max-w-md flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-2 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/30 transition-all">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Search executions by tool, command, output..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
      </div>

      {/* Execution Audit Log List */}
      <div className="flex-1 px-6 pb-6">
        {filteredLogs.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border rounded-xl">
            <Terminal className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
            <p className="text-sm text-muted-foreground">No execution logs found.</p>
            <Button
              variant="link"
              onClick={() => setIsNewTaskOpen(true)}
              className="text-primary text-xs mt-1"
            >
              Dispatch an execution task
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {filteredLogs.map((log) => {
              const isExpanded = expandedLogId === log.id;
              const paramsObj = parseJsonSafe(log.params);
              const preview =
                paramsObj.command ||
                paramsObj.query ||
                paramsObj.filePath ||
                paramsObj.code ||
                JSON.stringify(paramsObj);

              return (
                <div
                  key={log.id}
                  className="bg-surface border border-border rounded-xl overflow-hidden transition-all duration-200"
                >
                  <div
                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                    className="px-5 py-3.5 flex items-center justify-between gap-4 cursor-pointer hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-background border border-border flex items-center justify-center shrink-0">
                        {toolIcons[log.action] || <Terminal className="w-4 h-4 text-muted-foreground" />}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-mono font-semibold text-xs text-foreground">
                            {log.action}
                          </span>
                          <span
                            className={`text-[10px] font-mono px-2 py-0.2 rounded-full border uppercase ${
                              log.status === "success"
                                ? "text-green-400 bg-green-500/10 border-green-500/20"
                                : "text-red-400 bg-red-500/10 border-red-500/20"
                            }`}
                          >
                            {log.status}
                          </span>
                        </div>
                        <p className="text-xs font-mono text-muted-foreground truncate max-w-xl">
                          {preview}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1 font-mono text-[11px]">
                        <Clock className="w-3 h-3" />
                        {new Date(log.createdAt).toLocaleTimeString()}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Terminal Output Inspector */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="px-5 pb-4 pt-2 border-t border-border/60 bg-background/50 space-y-3"
                      >
                        <div>
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                            Parameters
                          </span>
                          <pre className="text-xs font-mono bg-surface p-2.5 rounded-lg border border-border text-foreground overflow-x-auto">
                            {JSON.stringify(paramsObj, null, 2)}
                          </pre>
                        </div>

                        <div>
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                            Execution Result / Standard Output
                          </span>
                          <pre className="text-xs font-mono bg-surface p-3 rounded-lg border border-border text-foreground overflow-x-auto max-h-60 whitespace-pre-wrap">
                            {log.result || "No output returned."}
                          </pre>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
