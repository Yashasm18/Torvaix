"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowUpRight, Bot, Brain, Terminal as TerminalIcon, Workflow } from "lucide-react"
import { useSystemStatus } from "@/hooks/use-system-status"
import { formatRelativeTime } from "@/lib/relative-time"
import { parseServerTimestamp } from "@/lib/server-time"

const REFRESH_MS = 30_000

interface ExecutionLog {
  action: string
  status: string
  createdAt: string
}

interface WorkspaceCounts {
  memories: number
  lastExecution: ExecutionLog | null
  pendingApprovals: number
  activeAutomations: number
  totalAutomations: number
}

type PartState = "online" | "degraded" | "offline" | "loading"

const stateConfig: Record<PartState, { color: string; label: string; dot: string }> = {
  online: { color: "text-green-400", label: "Online", dot: "bg-green-500 animate-pulse" },
  degraded: { color: "text-amber-400", label: "Limited", dot: "bg-amber-500" },
  offline: { color: "text-red-400", label: "Offline", dot: "bg-red-500" },
  loading: { color: "text-muted-foreground", label: "Checking…", dot: "bg-slate-500" },
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" })
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

/** The four parts of Torvaix that work behind every chat and task, and whether each one is running. */
export function BuiltInAgents({ workspaceId }: { workspaceId: string | null }) {
  const status = useSystemStatus()
  const [counts, setCounts] = useState<WorkspaceCounts | null>(null)

  useEffect(() => {
    // Never show one workspace's numbers under another's name while the new ones load.
    setCounts(null)
    if (!workspaceId) return
    const ws = encodeURIComponent(workspaceId)
    let cancelled = false

    const load = async () => {
      const [memory, executions, pending, stats] = await Promise.all([
        fetchJson<{ memories?: unknown[] }>(`/api/memory?workspaceId=${ws}`),
        fetchJson<{ logs?: ExecutionLog[] }>(`/api/agent/executions?workspaceId=${ws}&limit=1`),
        fetchJson<{ actions?: unknown[] }>(`/api/agent/pending-actions?workspaceId=${ws}&status=pending`),
        fetchJson<{ stats?: { activeCount?: number; totalAutomations?: number } }>(`/api/automations/stats?workspaceId=${ws}`),
      ])
      if (cancelled) return
      setCounts({
        memories: memory?.memories?.length ?? 0,
        lastExecution: executions?.logs?.[0] ?? null,
        pendingApprovals: pending?.actions?.length ?? 0,
        activeAutomations: stats?.stats?.activeCount ?? 0,
        totalAutomations: stats?.stats?.totalAutomations ?? 0,
      })
    }

    load()
    const interval = setInterval(load, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [workspaceId])

  const agentUp = status?.agent
  const state = (online: boolean | undefined, degraded = false): PartState =>
    status === null ? "loading" : !online ? "offline" : degraded ? "degraded" : "online"

  const lastRunAt = parseServerTimestamp(counts?.lastExecution?.createdAt)

  const parts = [
    {
      id: "orchestrator",
      name: "Orchestrator",
      icon: Bot,
      state: state(agentUp, agentUp && !status?.ollama && status?.model?.provider === "ollama"),
      description: "Reads each message, decides whether to recall, remember, answer or use a tool, and replies with your chat model.",
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
      description: "Saves the facts you share and finds them again by keyword, plus by meaning when vector search is on.",
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
      description: "Runs tools for chats and tasks. Shell and Python commands wait for your approval first.",
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
      description: "Runs your automations in the background, on a schedule or when something happens.",
      facts: [counts ? `${counts.activeAutomations} active of ${counts.totalAutomations} automations` : null],
      href: "/automation",
      cta: "Manage automations",
    },
  ]

  return (
    <section aria-labelledby="built-in-agents">
      <h2 id="built-in-agents" className="text-base font-semibold text-foreground">
        Built into Torvaix
      </h2>
      <p className="text-xs text-muted-foreground mt-0.5">
        The parts of Torvaix that work behind every chat and task, and whether each one is running.
      </p>

      <ul className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        {parts.map((part) => {
          const cfg = stateConfig[part.state]
          return (
            <li key={part.id} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2.5 min-w-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                    <part.icon className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-foreground">{part.name}</h3>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} aria-hidden="true" />
                      <span className={`text-xs font-mono ${cfg.color}`}>{cfg.label}</span>
                    </div>
                  </div>
                </div>
                <Link
                  href={part.href}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors shrink-0"
                >
                  {part.cta} <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                </Link>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">{part.description}</p>

              <div className="flex flex-wrap gap-1.5">
                {part.facts.filter(Boolean).map((fact) => (
                  <span
                    key={fact}
                    className="text-[10px] px-2.5 py-1 rounded-full bg-muted border border-border text-muted-foreground font-mono break-words"
                  >
                    {fact}
                  </span>
                ))}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
