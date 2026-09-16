"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Shield, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { describeActionParams } from "@/lib/approval"

interface PendingAction {
  id: string
  action: string
  params: string
  status: string
}

type LoadState =
  | { kind: "loading" }
  | { kind: "pending"; action: PendingAction }
  | { kind: "gone" }
  | { kind: "error" }

/**
 * Approval prompt for a tool call. The command shown comes from the server's record of the
 * pending action, never from the chat text, so what you review is what will run.
 */
export function ApprovalCard({
  pendingId,
  workspaceId,
  disabled,
  onResolve,
}: {
  pendingId: string
  workspaceId: string
  disabled: boolean
  onResolve: (pendingId: string, status: "approved" | "rejected") => Promise<boolean>
}) {
  const [state, setState] = useState<LoadState>({ kind: "loading" })
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/agent/pending-actions?workspaceId=${encodeURIComponent(workspaceId)}&status=pending`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: { actions?: PendingAction[] }) => {
        if (cancelled) return
        const action = data.actions?.find((a) => a.id === pendingId)
        setState(action ? { kind: "pending", action } : { kind: "gone" })
      })
      .catch(() => !cancelled && setState({ kind: "error" }))
    return () => {
      cancelled = true
    }
  }, [pendingId, workspaceId])

  const canDecide = state.kind === "pending" && !disabled && !decision
  const decide = async (status: "approved" | "rejected") => {
    setDecision(status)
    if (!(await onResolve(pendingId, status))) setDecision(null)
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3 bg-amber-500/10 border-b border-amber-500/20">
        <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
          <Shield className="w-4 h-4 text-amber-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-300">Security Approval Required</p>
          <p className="text-xs text-amber-400/70">
            {state.kind === "pending" ? (
              <>Torvaix wants to run <code className="font-mono">{state.action.action}</code></>
            ) : (
              "Torvaix needs your permission to run a command"
            )}
          </p>
        </div>
      </div>
      <div className="px-5 py-4 flex flex-col gap-3">
        {state.kind === "loading" && <p className="text-sm text-muted-foreground">Loading the command…</p>}
        {state.kind === "pending" && (
          <>
            <p className="text-sm text-muted-foreground">
              {decision === "approved"
                ? "You approved this command."
                : decision === "rejected"
                  ? "You denied this command."
                  : "This runs on your machine with your permissions. Approve only if you expect it."}
            </p>
            <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-background/60 px-3 py-2 text-xs font-mono text-foreground whitespace-pre-wrap break-all">
              {describeActionParams(state.action.params)}
            </pre>
          </>
        )}
        {state.kind === "gone" && (
          <p className="text-sm text-muted-foreground">This request has already been approved, denied or run.</p>
        )}
        {state.kind === "error" && (
          <p className="text-sm text-muted-foreground">
            Couldn&apos;t load the command from the agent server, so it can&apos;t be approved here. Try again from the Tasks page.
          </p>
        )}
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            size="sm"
            disabled={!canDecide}
            className="bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30 font-medium"
            onClick={() => decide("approved")}
          >
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Approve Execution
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!canDecide}
            className="border-red-500/30 text-red-400 hover:bg-red-500/10 font-medium"
            onClick={() => decide("rejected")}
          >
            <XCircle className="w-4 h-4 mr-2" />
            Deny
          </Button>
        </div>
      </div>
    </div>
  )
}
