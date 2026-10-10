/** One line of what the assistant is doing while a reply is being worked out. */
export interface ProgressStep {
  label: string
  detail?: string
}

/**
 * The steps of the newest run in the chat stream's data. The stream keeps data from earlier
 * replies too, so only entries with the last run's id count. Repeats of the same line collapse.
 */
export function latestProgress(data: unknown): ProgressStep[] {
  if (!Array.isArray(data)) return []
  const entries: { runId: string; label: string; detail?: string }[] = []
  for (const item of data) {
    const p = (item as { torvaixProgress?: unknown } | null)?.torvaixProgress as
      | { runId?: unknown; label?: unknown; detail?: unknown }
      | undefined
    if (!p || typeof p.runId !== "string" || typeof p.label !== "string") continue
    entries.push({ runId: p.runId, label: p.label, ...(typeof p.detail === "string" ? { detail: p.detail } : {}) })
  }
  const runId = entries[entries.length - 1]?.runId
  const steps: ProgressStep[] = []
  for (const { runId: id, label, detail } of entries) {
    if (id !== runId) continue
    const previous = steps[steps.length - 1]
    if (previous?.label === label && previous.detail === detail) continue
    steps.push(detail ? { label, detail } : { label })
  }
  return steps
}
