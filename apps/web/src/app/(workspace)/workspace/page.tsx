"use client"

import { useCallback, useEffect, useState } from "react"
import { motion } from "framer-motion"
import { BrainCircuit, Activity, Zap, ShieldAlert, CheckCircle2, XCircle, MessageSquare, BookOpen, CheckSquare, Share2, ArrowRight } from "lucide-react"
import Link from "next/link"

import { useActiveWorkspace } from "@/hooks/use-active-workspace"
import { parseServerTimestamp } from "@/lib/server-time"
import { describeActionParams } from "@/lib/approval"

interface MemoryRow {
  id: string
  content: string
  source: string
  createdAt: string
}

interface ExecutionLog {
  id: string
  action: string
  params?: string
  status: string
  createdAt: string
}

type ActivityKind = "memory" | "success" | "error"

interface ActivityItem {
  id: string
  at: Date
  kind: ActivityKind
  title: string
  detail: string
}

interface DashboardData {
  memoryCount: number
  activeAutomations: number
  pendingApprovals: number
  activity: ActivityItem[]
}

const REFRESH_INTERVAL_MS = 30_000
const ACTIVITY_LIMIT = 6

const shortcuts = [
  { href: "/chat", icon: MessageSquare, title: "Chat", description: "Ask, remember, or run a tool" },
  { href: "/knowledge", icon: BookOpen, title: "Knowledge", description: "Browse and add memories" },
  { href: "/tasks", icon: CheckSquare, title: "Tasks", description: "Tool runs and approvals" },
  { href: "/automation", icon: Zap, title: "Automations", description: "Scheduled and event-driven work" },
  { href: "/graph", icon: Share2, title: "Knowledge graph", description: "How your memories connect" },
]

const activityStyles: Record<ActivityKind, { icon: typeof CheckCircle2; color: string }> = {
  memory: { icon: BrainCircuit, color: "text-blue-400" },
  success: { icon: CheckCircle2, color: "text-primary" },
  error: { icon: XCircle, color: "text-red-400" },
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" })
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

function formatActivityTime(date: Date): string {
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  const isToday = date.toDateString() === new Date().toDateString()
  return isToday ? time : `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`
}

function timeOfDay(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "morning"
  if (hour < 18) return "afternoon"
  return "evening"
}

export default function OSWorkspace() {
  const { workspace, workspaceId } = useActiveWorkspace()
  const [data, setData] = useState<DashboardData | null>(null)
  const [unreachable, setUnreachable] = useState(false)

  const loadDashboard = useCallback(async () => {
    if (!workspaceId) return
    const ws = encodeURIComponent(workspaceId)

    const [memoryRes, automationRes, pendingRes, executionRes] = await Promise.all([
      fetchJson<{ memories?: MemoryRow[] }>(`/api/memory?workspaceId=${ws}`),
      fetchJson<{ stats?: { activeCount?: number } }>(`/api/automations/stats?workspaceId=${ws}`),
      fetchJson<{ actions?: unknown[] }>(`/api/agent/pending-actions?workspaceId=${ws}&status=pending`),
      fetchJson<{ logs?: ExecutionLog[] }>(`/api/agent/executions?workspaceId=${ws}&limit=${ACTIVITY_LIMIT}`),
    ])

    if (!memoryRes && !automationRes && !pendingRes && !executionRes) {
      setUnreachable(true)
      return
    }
    setUnreachable(false)

    const memories = memoryRes?.memories ?? []
    const activity: ActivityItem[] = [
      ...memories.map((m): ActivityItem | null => {
        const at = parseServerTimestamp(m.createdAt)
        return at && { id: `memory-${m.id}`, at, kind: "memory", title: "Memory saved", detail: m.content }
      }),
      ...(executionRes?.logs ?? []).map((log): ActivityItem | null => {
        const at = parseServerTimestamp(log.createdAt)
        const failed = log.status === "error"
        return at && {
          id: `execution-${log.id}`,
          at,
          kind: failed ? "error" : "success",
          title: failed ? `${log.action} failed` : `Ran ${log.action}`,
          // Show what ran (the command, code or arguments) rather than just "success".
          detail: log.params ? describeActionParams(log.params) : failed ? "Failed" : "Succeeded",
        }
      }),
    ]
      .filter((item): item is ActivityItem => item !== null)
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, ACTIVITY_LIMIT)

    setData({
      memoryCount: memories.length,
      activeAutomations: automationRes?.stats?.activeCount ?? 0,
      pendingApprovals: pendingRes?.actions?.length ?? 0,
      activity,
    })
  }, [workspaceId])

  useEffect(() => {
    setData(null)
    loadDashboard()
    const interval = setInterval(loadDashboard, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [loadDashboard])

  const stats = [
    { label: "Memories", value: data?.memoryCount, icon: BrainCircuit, color: "text-purple-400", href: "/knowledge" },
    { label: "Active automations", value: data?.activeAutomations, icon: Zap, color: "text-primary", href: "/automation" },
    { label: "Pending approvals", value: data?.pendingApprovals, icon: ShieldAlert, color: "text-amber-400", href: "/tasks" },
  ]

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-y-auto @container">
      <div className="max-w-5xl w-full mx-auto p-6 md:p-8">
        {/* Greeting */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <h1 className="text-2xl font-bold tracking-tight text-foreground mb-1">Good {timeOfDay()}</h1>
          <p className="text-sm text-muted-foreground">
            Here&apos;s what&apos;s happening in {workspace?.name ?? "your workspace"}.
          </p>
          {unreachable && (
            <p className="mt-3 text-sm text-red-400">
              Couldn&apos;t reach the agent server. Make sure it&apos;s running, then this page refreshes automatically.
            </p>
          )}
        </motion.div>

        {/* Quick Stats Grid — container queries, since this page lives in a resizable panel */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="grid grid-cols-1 @2xl:grid-cols-3 gap-4 mb-10"
        >
          {stats.map((stat) => (
            <Link
              key={stat.label}
              href={stat.href}
              className="bg-surface border border-border p-5 rounded-xl flex flex-col items-start shadow-sm hover:border-primary/40 transition-colors"
            >
              <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
                <stat.icon className={`w-4 h-4 ${stat.color}`} /> {stat.label}
              </div>
              <div className="text-3xl font-bold text-foreground">{stat.value ?? "—"}</div>
            </Link>
          ))}
        </motion.div>

        <div className="grid grid-cols-1 @4xl:grid-cols-[1.4fr_1fr] gap-8">
          {/* Recent Activity Feed */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-col @container"
          >
            <h2 className="flex items-center gap-2 mb-4 text-sm font-semibold text-foreground">
              <Activity className="w-4 h-4 text-muted-foreground" />
              Recent activity
            </h2>
            {data && data.activity.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                No activity yet. Save a memory or run a task and it will show up here.
              </div>
            ) : (
              <ul className="rounded-xl border border-border bg-surface divide-y divide-border/60 overflow-hidden">
                {(data?.activity ?? []).map((item) => {
                  const { icon: Icon, color } = activityStyles[item.kind]
                  return (
                    <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${color}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-sm font-medium text-foreground truncate">{item.title}</span>
                          <time className="text-xs font-mono text-muted-foreground shrink-0" dateTime={item.at.toISOString()}>
                            {formatActivityTime(item.at)}
                          </time>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">{item.detail}</p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </motion.div>

          {/* Shortcuts */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col"
          >
            <h2 className="mb-4 text-sm font-semibold text-foreground">Jump to</h2>
            <div className="grid grid-cols-1 @sm:grid-cols-2 @4xl:grid-cols-1 gap-2">
              {shortcuts.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 hover:border-primary/40 transition-colors"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <item.icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">{item.title}</span>
                    <span className="block text-xs text-muted-foreground truncate">{item.description}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                </Link>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
