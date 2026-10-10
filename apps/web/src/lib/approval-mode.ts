/** Whether commands the assistant wants to run wait for the user. Mirrors the agent server's modes. */
export type ApprovalMode = "ask" | "auto" | "bypass"

export const APPROVAL_MODES: { id: ApprovalMode; label: string; description: string }[] = [
  { id: "ask", label: "Ask every time", description: "Every command waits for you to approve it." },
  { id: "auto", label: "Auto", description: "Runs calculations and read-only commands without asking. Anything that changes files still waits." },
  { id: "bypass", label: "Bypass", description: "Runs every command without asking. Only for work you trust." },
]

export function toApprovalMode(value: unknown): ApprovalMode {
  return value === "auto" || value === "bypass" ? value : "ask"
}

const KEY = "torvaix.approvalMode"
const listeners = new Set<() => void>()

/** The saved choice. Reading storage can throw (private windows), which then means "ask". */
export function readApprovalMode(): ApprovalMode {
  try {
    return toApprovalMode(window.localStorage.getItem(KEY))
  } catch {
    return "ask"
  }
}

export function saveApprovalMode(mode: ApprovalMode): void {
  try {
    window.localStorage.setItem(KEY, mode)
  } catch {
    // Not saved: the choice then lasts until the page reloads, which is the safe direction.
  }
  current = mode
  listeners.forEach((l) => l())
}

let current: ApprovalMode | null = null

export function subscribeApprovalMode(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function currentApprovalMode(): ApprovalMode {
  current ??= readApprovalMode()
  return current
}
