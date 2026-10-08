import { AlertCircle, CheckCircle2, Shield, Square } from "lucide-react"
import type { AgentRunStatus } from "@/lib/agents"
import { runStatusLabel } from "@/lib/agent-form"

const tones: Record<AgentRunStatus, { className: string; Icon: typeof CheckCircle2 }> = {
  completed: { className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400", Icon: CheckCircle2 },
  awaiting_approval: { className: "border-amber-500/30 bg-amber-500/10 text-amber-400", Icon: Shield },
  error: { className: "border-red-500/30 bg-red-500/10 text-red-400", Icon: AlertCircle },
  // Stopped or denied by the user. Nothing went wrong, so it is not red.
  cancelled: { className: "border-border bg-muted text-muted-foreground", Icon: Square },
}

// A status this page doesn't know yet still shows, in a neutral tone.
const unknownTone = { className: "border-border bg-muted text-muted-foreground", Icon: AlertCircle }

/** The status of a run as a small pill: an icon and a word, never colour alone. */
export function RunStatusBadge({ status }: { status: AgentRunStatus }) {
  const tone = tones[status] ?? unknownTone
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone.className}`}>
      <tone.Icon className="w-3 h-3" aria-hidden="true" />
      {runStatusLabel(status)}
    </span>
  )
}
