"use client"

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Bot, Zap, Brain, Terminal as TerminalIcon, Workflow, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActiveWorkspace } from "@/hooks/use-active-workspace";
import { useSystemStatus } from "@/hooks/use-system-status";
import { parseServerTimestamp } from "@/lib/server-time";
import { formatRelativeTime } from "@/lib/relative-time";

const REFRESH_MS = 30_000;

interface ExecutionLog {
  action: string;
  status: string;
  createdAt: string;
}

interface WorkspaceCounts {
  memories: number;
  lastExecution: ExecutionLog | null;
  pendingApprovals: number;
  activeAutomations: number;
  totalAutomations: number;
}

type AgentState = "online" | "degraded" | "offline" | "loading";

const stateConfig: Record<AgentState, { color: string; label: string; dot: string }> = {
  online: { color: "text-green-400", label: "Online", dot: "bg-green-500 animate-pulse" },
  degraded: { color: "text-amber-400", label: "Degraded", dot: "bg-amber-500" },
  offline: { color: "text-red-400", label: "Offline", dot: "bg-red-500" },
  loading: { color: "text-muted-foreground", label: "Checking…", dot: "bg-slate-500" },
};

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export default function AgentsPage() {
  const { workspaceId } = useActiveWorkspace();
  const status = useSystemStatus();
  const [counts, setCounts] = useState<WorkspaceCounts | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    const ws = encodeURIComponent(workspaceId);
    let cancelled = false;

    const load = async () => {
      const [memory, executions, pending, stats] = await Promise.all([
        fetchJson<{ memories?: unknown[] }>(`/api/memory?workspaceId=${ws}`),
        fetchJson<{ logs?: ExecutionLog[] }>(`/api/agent/executions?workspaceId=${ws}&limit=1`),
        fetchJson<{ actions?: unknown[] }>(`/api/agent/pending-actions?workspaceId=${ws}&status=pending`),
        fetchJson<{ stats?: { activeCount?: number; totalAutomations?: number } }>(`/api/automations/stats?workspaceId=${ws}`),
      ]);
      if (cancelled) return;
      setCounts({
        memories: memory?.memories?.length ?? 0,
        lastExecution: executions?.logs?.[0] ?? null,
        pendingApprovals: pending?.actions?.length ?? 0,
        activeAutomations: stats?.stats?.activeCount ?? 0,
        totalAutomations: stats?.stats?.totalAutomations ?? 0,
      });
    };

    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [workspaceId]);

  const agentUp = status?.agent;
  const state = (online: boolean | undefined, degraded = false): AgentState =>
    status === null ? "loading" : !online ? "offline" : degraded ? "degraded" : "online";

  const lastRunAt = parseServerTimestamp(counts?.lastExecution?.createdAt);

  const agents = [
    {
      id: "orchestrator",
      name: "Orchestrator",
      icon: Bot,
      state: state(agentUp, agentUp && !status?.ollama && status?.model?.provider === "ollama"),
      description: "Classifies each message, pulls relevant memories into context, and answers with the configured LLM.",
      facts: [
        `Model: ${status?.model?.id ?? "—"}`,
        status?.model ? (status.model.provider === "ollama" ? (status.ollama ? "Ollama reachable" : "Ollama unreachable") : status.model.provider) : null,
      ],
      href: "/chat",
      cta: "Open chat",
    },
    {
      id: "memory",
      name: "Memory Agent",
      icon: Brain,
      state: state(agentUp && status?.sqlite, !status?.qdrant),
      description: "Stores facts you share and retrieves them with hybrid keyword + vector search (BM25 and embeddings, fused with RRF).",
      facts: [
        counts ? `${counts.memories} memories in this workspace` : null,
        status ? `Vectors: ${status.qdrant ? "Qdrant" : "off (keyword only)"}` : null,
        status?.embeddings ? `Embeddings: ${status.embeddings}` : null,
      ],
      href: "/knowledge",
      cta: "View knowledge",
    },
    {
      id: "executor",
      name: "Tool Executor",
      icon: TerminalIcon,
      state: state(agentUp),
      description: "Runs tool calls for dispatched tasks. Risky actions wait for your approval before they execute.",
      facts: [
        counts?.lastExecution
          ? `Last run: ${counts.lastExecution.action} (${counts.lastExecution.status}) ${formatRelativeTime(lastRunAt)}`
          : counts ? "No runs yet" : null,
        counts ? `${counts.pendingApprovals} pending approval${counts.pendingApprovals === 1 ? "" : "s"}` : null,
      ],
      href: "/tasks",
      cta: "Dispatch a task",
    },
    {
      id: "automation",
      name: "Automation Engine",
      icon: Workflow,
      state: state(agentUp),
      description: "Runs scheduled and event-triggered workflows in the background, without overlapping runs.",
      facts: [counts ? `${counts.activeAutomations} active of ${counts.totalAutomations} automations` : null],
      href: "/automation",
      cta: "Manage automations",
    },
  ];

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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Agents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            The agents running inside your local Torvaix server, with live status.
          </p>
        </div>
        <Link href="/tasks">
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 rounded-lg">
            <Zap className="w-4 h-4" />
            Dispatch Task
          </Button>
        </Link>
      </motion.div>

      {status && !status.agent && (
        <div className="mx-6 mt-4 p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-sm text-red-400">
          The agent server isn&apos;t running, so no agents are available. Start it with <code className="font-mono">npm run dev</code>.
        </div>
      )}

      {/* Agent Cards */}
      <div className="flex-1 px-6 pb-6 pt-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {agents.map((agent, index) => {
            const cfg = stateConfig[agent.state];
            return (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.06, duration: 0.3 }}
                className="bg-surface border border-border rounded-xl p-6 hover:border-primary/30 transition-all duration-200 group flex flex-col"
              >
                <div className="flex items-start justify-between mb-4 gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                      <agent.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{agent.name}</h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        <span className={`text-xs font-mono ${cfg.color}`}>{cfg.label}</span>
                      </div>
                    </div>
                  </div>
                  <Link
                    href={agent.href}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors shrink-0"
                  >
                    {agent.cta} <ArrowUpRight className="w-3 h-3" />
                  </Link>
                </div>

                <p className="text-sm text-muted-foreground leading-relaxed mb-4 flex-1">
                  {agent.description}
                </p>

                <div className="flex flex-wrap gap-1.5">
                  {agent.facts.filter(Boolean).map((fact) => (
                    <span
                      key={fact}
                      className="text-[10px] px-2.5 py-1 rounded-full bg-muted border border-border text-muted-foreground font-mono"
                    >
                      {fact}
                    </span>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
