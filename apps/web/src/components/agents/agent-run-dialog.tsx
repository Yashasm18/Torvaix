"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Bot, Loader2, Play, Square } from "lucide-react"
import { ApprovalCard } from "@/components/chat/approval-card"
import { MarkdownMessage } from "@/components/chat/markdown"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { NO_RESPONSE, responseError } from "@/lib/api-error"
import type { Agent, AgentRun, AgentToolInfo } from "@/lib/agents"
import { TASK_MAX, formatDuration, isCommandUndecided, runStatusLabel, validateTask } from "@/lib/agent-form"
import { RunHistory } from "./run-history"
import { RunStatusBadge } from "./run-status-badge"
import { ToolChips } from "./tool-chips"

type RunRequest = { task: string } | { pendingActionId: string }

type RunReply = { run: AgentRun } | { error: string; status?: number }
type RunResult = RunReply | { stopped: true }

/** What is going on while a request is out. `closing` is the short request that ends a denied run. */
type Busy = "starting" | "continuing" | "checking" | "closing"

const BUSY_TEXT: Record<Busy, { button: string; detail: string; live: string }> = {
  starting: {
    button: "Running…",
    detail: "Working on it. This can take a minute. Shell and Python commands will ask for your approval first.",
    live: "Running.",
  },
  continuing: {
    button: "Running…",
    detail: "Running the approved command. This can take a minute.",
    live: "Running the approved command.",
  },
  checking: {
    button: "Checking…",
    detail: "Checking this run. If its command was already approved, the run carries on. This can take a minute.",
    live: "Checking the run.",
  },
  closing: {
    button: "Working…",
    detail: "Closing the run, since you denied the command.",
    live: "Closing the run.",
  },
}

/**
 * Starts a run (`task`) or picks one up again by the command it waits on (`pendingActionId`):
 * the server continues it after an approval, closes it after a denial, and refuses while the
 * command has not been decided.
 */
async function requestRun(agentId: string, body: RunRequest, signal: AbortSignal): Promise<RunResult> {
  const reply = await sendRunRequest(agentId, body, signal)
  // Stop can land while the reply is being read. That looks like a failure but isn't one.
  return signal.aborted && !("run" in reply) ? { stopped: true } : reply
}

async function sendRunRequest(agentId: string, body: RunRequest, signal: AbortSignal): Promise<RunReply> {
  try {
    const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    })
    if (!res.ok) return { error: await responseError(res), status: res.status }
    const data = await res.json().catch(() => null)
    if (!data?.run) return { error: "The agent server sent a reply this page couldn't read." }
    return { run: data.run as AgentRun }
  } catch {
    return { error: NO_RESPONSE }
  }
}

/** Run one agent on a task, approve its shell and Python commands, and look back at its earlier runs. */
export function AgentRunDialog({
  open,
  agent,
  availableTools,
  workspaceId,
  onOpenChange,
  onRunSettled,
}: {
  open: boolean
  agent: Agent | null
  availableTools: AgentToolInfo[]
  workspaceId: string
  onOpenChange: (open: boolean) => void
  /** A run started, finished or moved on, so the agent's run count and last run time have changed. */
  onRunSettled: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto grid-cols-[minmax(0,1fr)]">
        {agent && (
          <RunBody
            key={agent.id}
            agent={agent}
            availableTools={availableTools}
            workspaceId={workspaceId}
            onRunSettled={onRunSettled}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function RunBody({
  agent,
  availableTools,
  workspaceId,
  onRunSettled,
}: {
  agent: Agent
  availableTools: AgentToolInfo[]
  workspaceId: string
  onRunSettled: () => void
}) {
  const [task, setTask] = useState("")
  const [taskError, setTaskError] = useState<string | null>(null)
  const [run, setRun] = useState<AgentRun | null>(null)
  const [busy, setBusy] = useState<Busy | null>(null)
  const [error, setError] = useState<string | null>(null)
  // A short neutral message, for when the user pressed Stop.
  const [note, setNote] = useState<string | null>(null)
  // The user decided on a command, but the request that tells the run about it failed. Set to that
  // decision so it can be sent again.
  const [retry, setRetry] = useState<{ approvalId: string; decision: "approved" | "rejected" } | null>(null)

  const [history, setHistory] = useState<AgentRun[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [historyError, setHistoryError] = useState<string | null>(null)

  const uid = useId()
  const taskRef = useRef<HTMLTextAreaElement>(null)
  // A reply that arrives after the dialog was closed must not be shown, and an older history
  // reply must not overwrite a newer one.
  const mounted = useRef(true)
  const historySeq = useRef(0)
  // Aborts the run request that is out, if any. Closing the dialog does not use it: a run goes on
  // and shows up in Recent runs later. Only the Stop button does.
  const controller = useRef<AbortController | null>(null)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const loadHistory = async () => {
    const seq = ++historySeq.current
    const current = () => mounted.current && seq === historySeq.current
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}/runs?limit=20`, { cache: "no-store" })
      if (!current()) return
      if (!res.ok) {
        setHistoryError(`Couldn't load the recent runs. ${await responseError(res)}`)
        return
      }
      const data = await res.json().catch(() => null)
      if (!current()) return
      setHistory(Array.isArray(data?.runs) ? data.runs : [])
      setHistoryError(null)
    } catch {
      if (current()) setHistoryError(NO_RESPONSE)
    } finally {
      if (current()) setHistoryLoading(false)
    }
  }

  useEffect(() => {
    loadHistory()
  }, [])

  const pendingId = run?.status === "awaiting_approval" ? run.pendingActionId : null
  // Starting another task while a command waits would leave that command dangling. A run without
  // its command has nothing to approve, so it must not hold the Run button either.
  const waitingForApproval = !!pendingId

  const showRun = (next: AgentRun) => {
    setRun(next)
    setRetry(null)
    setNote(null)
    setError(null)
  }

  // Sends one run request and keeps the busy state, the Stop button and the history in step with
  // it. Returns what the server said, or null when there is nothing to show: the user pressed
  // Stop, or the dialog was closed (the request still goes through, so the run is not lost).
  const perform = async (mode: Busy, body: RunRequest): Promise<RunReply | null> => {
    if (mounted.current) {
      setBusy(mode)
      setError(null)
      setRetry(null)
      setNote(null)
    }
    const request = new AbortController()
    controller.current = request
    const result = await requestRun(agent.id, body, request.signal)
    if (controller.current === request) controller.current = null
    onRunSettled()
    if (!mounted.current) return null
    setBusy(null)
    // The server saves a stopped run, so look at the history again.
    loadHistory()
    if ("stopped" in result) {
      // Whatever was on screen belongs to a run that has just been cancelled.
      setRun(null)
      setNote("You stopped the run. It is saved in Recent runs.")
      return null
    }
    return result
  }

  const stop = () => controller.current?.abort()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy || waitingForApproval) return
    const problem = validateTask(task)
    setTaskError(problem)
    if (problem) {
      taskRef.current?.focus()
      return
    }

    setRun(null)
    const result = await perform("starting", { task: task.trim() })
    if (!result) return
    if ("error" in result) setError(`Couldn't run the agent. ${result.error}`)
    else showRun(result.run)
  }

  const handleTaskChange = (value: string) => {
    setTask(value)
    // Once a problem has been shown, keep it up to date as the text changes.
    if (taskError) setTaskError(validateTask(value))
  }

  // Tells the run about the user's decision on its command. The server continues the run after an
  // approval (it may stop again at the next command) and closes it as stopped after a denial.
  const followUp = async (approvalId: string, decision: "approved" | "rejected") => {
    const result = await perform(decision === "approved" ? "continuing" : "closing", { pendingActionId: approvalId })
    if (!result) return
    if ("error" in result) {
      setError(
        decision === "approved"
          ? `You approved the command, but the agent couldn't continue. ${result.error}`
          : `You denied the command, but the run couldn't be closed. ${result.error}`
      )
      setRetry({ approvalId, decision })
    } else {
      showRun(result.run)
    }
  }

  // Called by the approval card. True when the decision was recorded, even if the run then failed to continue.
  const resolveApproval = async (approvalId: string, status: "approved" | "rejected"): Promise<boolean> => {
    if (mounted.current) setError(null)
    const verb = status === "approved" ? "approve" : "deny"
    let res: Response
    try {
      res = await fetch("/api/agent/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingActionId: approvalId, status }),
      })
    } catch {
      if (mounted.current) setError(NO_RESPONSE)
      return false
    }
    if (!res.ok) {
      const message = await responseError(res)
      if (mounted.current) setError(`Couldn't ${verb} the command. ${message}`)
      return false
    }
    // A denial closes the run on the server, which sends the closed run back with the answer.
    // There is then nothing left to continue: asking again would find no run waiting.
    const closed = status === "rejected" ? ((await res.json().catch(() => null)) as { run?: AgentRun } | null)?.run : undefined
    if (closed) {
      onRunSettled()
      if (mounted.current) {
        showRun(closed)
        loadHistory()
      }
      return true
    }
    // The decision is recorded, so the run has to hear about it even if the dialog was closed in
    // the meantime. Otherwise an approved command would never run.
    await followUp(approvalId, status)
    return true
  }

  // A run that says it is waiting may have been decided somewhere else since the list was loaded
  // (the Tasks page, a chat). The server knows, so ask it before showing a command to approve.
  const reviewRun = async (target: AgentRun) => {
    if (busy) return
    taskRef.current?.closest("[data-slot='dialog-content']")?.scrollTo({ top: 0, behavior: "smooth" })
    const approvalId = target.status === "awaiting_approval" ? target.pendingActionId : null
    if (!approvalId) {
      showRun(target)
      return
    }

    setRun(null)
    const result = await perform("checking", { pendingActionId: approvalId })
    if (!result) return
    if ("error" in result) {
      // Nobody has decided yet, so the command is still there to approve or deny.
      if (isCommandUndecided(result.status, result.error)) showRun(target)
      else setError(`Couldn't open the run. ${result.error}`)
    } else {
      showRun(result.run)
    }
  }

  const liveStatus = busy ? BUSY_TEXT[busy].live : run ? `Run finished: ${runStatusLabel(run.status)}.` : ""

  return (
    <>
      <DialogHeader className="min-w-0">
        <DialogTitle className="text-xl font-bold flex items-center gap-2 break-words">
          <Bot className="w-5 h-5 text-primary shrink-0" aria-hidden="true" />
          Run {agent.name}
        </DialogTitle>
        <DialogDescription className="break-words">
          {agent.description || "Give it a task. It follows its own instructions and uses only the tools below."}
        </DialogDescription>
      </DialogHeader>

      <ToolChips toolIds={agent.tools} tools={availableTools} />

      <form onSubmit={handleSubmit} noValidate className="space-y-3 min-w-0">
        <fieldset disabled={busy !== null} className="space-y-3 min-w-0">
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor={`${uid}-task`} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Task
              </label>
              <span
                className={`text-[11px] font-mono ${task.trim().length > TASK_MAX ? "text-red-400" : "text-muted-foreground"}`}
              >
                {task.trim().length.toLocaleString("en-US")} / {TASK_MAX.toLocaleString("en-US")}
              </span>
            </div>
            <textarea
              ref={taskRef}
              id={`${uid}-task`}
              rows={4}
              value={task}
              onChange={(e) => handleTaskChange(e.target.value)}
              placeholder="What should this agent do? For example: Summarise the open questions in my notes."
              aria-required="true"
              aria-invalid={taskError ? true : undefined}
              aria-describedby={taskError ? `${uid}-task-error` : undefined}
              className="w-full mt-1.5 max-h-60 overflow-y-auto bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary aria-[invalid=true]:border-red-500/60 disabled:opacity-60"
            />
            {taskError && (
              <p id={`${uid}-task-error`} role="alert" className="text-xs text-red-400 mt-1.5">
                {taskError}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {waitingForApproval && (
              <p className="text-xs text-muted-foreground">Approve or deny the command below first.</p>
            )}
            <Button type="submit" disabled={waitingForApproval} className="gap-1.5">
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Play className="w-3.5 h-3.5" aria-hidden="true" />}
              {busy ? BUSY_TEXT[busy].button : "Run"}
            </Button>
          </div>
        </fieldset>
      </form>

      <p role="status" className="sr-only">
        {liveStatus}
      </p>

      {busy && (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-background/60 px-4 py-3 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 mt-0.5 animate-spin text-primary shrink-0" aria-hidden="true" />
          <span className="flex-1 min-w-0">{BUSY_TEXT[busy].detail}</span>
          {/* Outside the fieldset above, which is disabled while a request is out. */}
          {busy !== "closing" && (
            <Button type="button" size="sm" variant="outline" onClick={stop} aria-label="Stop the run" className="shrink-0 gap-1.5">
              <Square className="w-3 h-3 fill-current" aria-hidden="true" />
              Stop
            </Button>
          )}
        </div>
      )}

      {note && (
        <p role="status" className="rounded-xl border border-border bg-background/60 px-4 py-3 text-sm text-muted-foreground">
          {note}
        </p>
      )}

      {error && (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400 space-y-2 min-w-0">
          <p className="break-words">{error}</p>
          {retry && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => followUp(retry.approvalId, retry.decision)}
            >
              {retry.decision === "approved" ? "Try to continue again" : "Try to close the run again"}
            </Button>
          )}
        </div>
      )}

      {run && (
        <section aria-label="Result" className="space-y-3 min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <RunStatusBadge status={run.status} />
            <span>{formatDuration(run.durationMs)}</span>
          </div>

          {run.status === "error" ? (
            <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              <p className="font-medium">The run failed.</p>
              <p className="mt-1 whitespace-pre-wrap break-words max-h-72 overflow-y-auto">
                {run.output || "The agent gave no details."}
              </p>
            </div>
          ) : (
            <>
              {run.status === "completed" || run.output ? (
                <div className="max-h-96 overflow-y-auto rounded-xl border border-border bg-background/60 px-4 py-3">
                  {run.output ? (
                    <MarkdownMessage content={run.output} />
                  ) : (
                    <p className="text-sm text-muted-foreground">The agent finished without writing a reply.</p>
                  )}
                </div>
              ) : null}
              {run.status === "awaiting_approval" &&
                (pendingId ? (
                  <ApprovalCard
                    key={pendingId}
                    pendingId={pendingId}
                    workspaceId={workspaceId}
                    disabled={busy !== null}
                    onResolve={resolveApproval}
                  />
                ) : (
                  <p role="alert" className="text-sm text-red-400">
                    This run is waiting for approval, but the request is missing. Try the run again.
                  </p>
                ))}
            </>
          )}
        </section>
      )}

      <RunHistory
        runs={history}
        loading={historyLoading}
        error={historyError}
        onRetry={() => {
          setHistoryLoading(true)
          loadHistory()
        }}
        onReview={reviewRun}
      />
    </>
  )
}
