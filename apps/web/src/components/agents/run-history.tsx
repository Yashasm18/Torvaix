"use client"

import { useState } from "react"
import { ChevronRight, RefreshCw } from "lucide-react"
import { LoadError } from "@/components/load-error"
import { MarkdownMessage } from "@/components/chat/markdown"
import { Button } from "@/components/ui/button"
import type { AgentRun } from "@/lib/agents"
import { formatDuration } from "@/lib/agent-form"
import { formatRelativeTime } from "@/lib/relative-time"
import { parseServerTimestamp } from "@/lib/server-time"
import { RunStatusBadge } from "./run-status-badge"

/** An agent's recent runs, newest first. Each row opens to show the task and the output. */
export function RunHistory({
  runs,
  loading,
  error,
  onRetry,
  onReview,
}: {
  runs: AgentRun[]
  loading: boolean
  error: string | null
  onRetry: () => void
  /** Open a run that is still waiting for approval, to approve or deny it. */
  onReview: (run: AgentRun) => void
}) {
  return (
    <section aria-labelledby="agent-run-history" className="space-y-2 min-w-0">
      <h3 id="agent-run-history" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Recent runs
      </h3>
      {error && <LoadError message={error} onRetry={onRetry} />}
      {loading && runs.length === 0 && !error ? (
        <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-primary" aria-hidden="true" />
          Loading runs…
        </p>
      ) : runs.length === 0 ? (
        !error && <p className="text-xs text-muted-foreground py-2">This agent hasn&apos;t run yet.</p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-lg border border-border bg-background/40">
          {runs.map((run) => (
            <RunRow key={run.id} run={run} onReview={onReview} />
          ))}
        </ul>
      )}
    </section>
  )
}

function RunRow({ run, onReview }: { run: AgentRun; onReview: (run: AgentRun) => void }) {
  const [open, setOpen] = useState(false)
  const panelId = `agent-run-${run.id}`
  const startedAt = parseServerTimestamp(run.createdAt)

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-start gap-2 px-3 py-2.5 text-left rounded-lg hover:bg-muted/30 transition-colors"
      >
        <ChevronRight
          className={`w-4 h-4 mt-0.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-foreground">{run.task}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <RunStatusBadge status={run.status} />
            <span title={startedAt?.toLocaleString()}>{formatRelativeTime(startedAt)}</span>
            <span>{formatDuration(run.durationMs)}</span>
          </span>
        </span>
      </button>

      {open && (
        <div id={panelId} className="space-y-3 border-t border-border/60 px-3 py-3 min-w-0">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Task</p>
            <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-sm text-foreground">{run.task}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Output</p>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-border bg-background/60 px-3 py-2">
              {!run.output ? (
                <p className="text-sm text-muted-foreground">No output.</p>
              ) : run.status === "error" ? (
                <p className="whitespace-pre-wrap break-words text-sm text-red-400">{run.output}</p>
              ) : (
                <MarkdownMessage content={run.output} />
              )}
            </div>
          </div>
          {run.status === "awaiting_approval" && run.pendingActionId && (
            <Button type="button" size="sm" variant="outline" onClick={() => onReview(run)}>
              Review the command
            </Button>
          )}
        </div>
      )}
    </li>
  )
}
