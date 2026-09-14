"use client"

import { useCallback, useEffect, useState } from "react"
import { motion } from "framer-motion"
import { BrainCircuit, Activity, Zap, ShieldAlert, CheckCircle2, XCircle } from "lucide-react"
import Link from "next/link"

import { AppLogo } from "@/components/ui/app-logo"
import { useActiveWorkspace } from "@/hooks/use-active-workspace"
import { parseServerTimestamp } from "@/lib/server-time"

interface MemoryRow {
  id: string
  content: string
  source: string
  createdAt: string
}

interface ExecutionLog {
  id: string
  action: string
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
  if (hour < 12) return "Morning"
  if (hour < 18) return "Afternoon"
  return "Evening"
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
          title: failed ? `Tool failed: ${log.action}` : `Tool ran: ${log.action}`,
          detail: log.status,
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
    { label: "Active Automations", value: data?.activeAutomations, icon: Zap, color: "text-primary", href: "/automation" },
    { label: "Pending Approvals", value: data?.pendingApprovals, icon: ShieldAlert, color: "text-amber-400", href: "/tasks" },
  ]

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-y-auto @container">
      <div className="max-w-5xl w-full mx-auto p-8 md:p-12">
        {/* Greeting */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-12"
        >
          <h1 className="text-4xl font-bold tracking-tight text-foreground mb-2">Good {timeOfDay()}</h1>
          <p className="text-muted-foreground text-lg">
            Here is what&apos;s happening in {workspace?.name ?? "your workspace"}.
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
          className="grid grid-cols-1 @2xl:grid-cols-3 gap-6 mb-16"
        >
          {stats.map((stat) => (
            <Link
              key={stat.label}
              href={stat.href}
              className="bg-surface border border-border p-6 rounded-2xl flex flex-col items-start shadow-sm hover:border-primary/40 transition-colors"
            >
              <div className="flex items-center gap-3 mb-4 text-foreground font-medium">
                <stat.icon className={`w-5 h-5 ${stat.color}`} /> {stat.label}
              </div>
              <div className="text-4xl font-bold text-foreground">{stat.value ?? "—"}</div>
            </Link>
          ))}
        </motion.div>

        <div className="grid grid-cols-1 @4xl:grid-cols-2 gap-12">
          {/* Recent Activity Feed */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-col @container"
          >
            <div className="flex items-center gap-2 mb-6 text-foreground font-semibold">
              <Activity className="w-5 h-5 text-muted-foreground" />
              Recent Activity
            </div>
            {data && data.activity.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                No activity yet. Save a memory or run a task and it will show up here.
              </div>
            ) : (
              <div className="flex flex-col relative before:absolute before:inset-0 before:ml-[1.4rem] before:-translate-x-px @lg:before:mx-auto @lg:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                {(data?.activity ?? []).map((item) => {
                  const { icon: Icon, color } = activityStyles[item.kind]
                  return (
                    <div key={item.id} className="relative flex items-center justify-between @lg:justify-normal @lg:odd:flex-row-reverse group is-active mb-6 last:mb-0">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-background bg-surface text-muted-foreground shadow shrink-0 @lg:order-1 @lg:group-odd:-translate-x-1/2 @lg:group-even:translate-x-1/2 z-10">
                        <Icon className={`w-4 h-4 ${color}`} />
                      </div>
                      <div className="w-[calc(100%-4rem)] @lg:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-border bg-surface shadow-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-foreground">{item.title}</span>
                          <time className="text-xs font-mono text-muted-foreground" dateTime={item.at.toISOString()}>
                            {formatActivityTime(item.at)}
                          </time>
                        </div>
                        <div className="text-sm text-muted-foreground line-clamp-2">{item.detail}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </motion.div>

          {/* Signature Visual Element: Knowledge Pulse */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col"
          >
            <div className="flex items-center gap-2 mb-6 text-foreground font-semibold">
              Knowledge Pulse
            </div>
            <div className="bg-surface border border-border rounded-2xl h-[300px] relative overflow-hidden flex items-center justify-center">
              {/* Background gradient blur */}
              <div className="absolute inset-0 bg-primary/5 blur-3xl rounded-full scale-150" />

              {/* Central Node */}
              <div className="relative z-10 flex items-center justify-center">
                <motion.div
                  animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute w-24 h-24 bg-primary/20 rounded-full blur-xl"
                />
                <div className="z-20">
                  <AppLogo size={48} animated={true} />
                </div>

                {/* Orbital Nodes */}
                <motion.div
                  className="absolute w-40 h-40 border border-primary/20 rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                >
                  <Link href="/agents">
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-background border border-border px-3 py-1 rounded-full text-xs text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer">Agents</div>
                  </Link>
                </motion.div>

                <motion.div
                  className="absolute w-60 h-60 border border-blue-400/20 rounded-full"
                  animate={{ rotate: -360 }}
                  transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                >
                  <Link href="/projects">
                    <div className="absolute top-1/2 -left-3 -translate-y-1/2 bg-background border border-border px-3 py-1 rounded-full text-xs text-muted-foreground hover:bg-blue-400/10 hover:text-blue-400 transition-colors cursor-pointer" style={{ transform: "translateY(-50%) rotate(360deg)" }}>Projects</div>
                  </Link>
                </motion.div>

                <motion.div
                  className="absolute w-80 h-80 border border-purple-400/20 rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
                >
                  <Link href="/knowledge">
                    <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-background border border-border px-3 py-1 rounded-full text-xs text-muted-foreground hover:bg-purple-400/10 hover:text-purple-400 transition-colors cursor-pointer" style={{ transform: "translateX(-50%) rotate(-360deg)" }}>Knowledge</div>
                  </Link>
                  <Link href="/debug/memory">
                    <div className="absolute top-1/2 -right-3 -translate-y-1/2 bg-background border border-border px-3 py-1 rounded-full text-xs text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer" style={{ transform: "translateY(-50%) rotate(-360deg)" }}>Memory</div>
                  </Link>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
