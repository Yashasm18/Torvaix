/** Whether commands the assistant wants to run wait for the user. Mirrors the agent server's modes. */
export type ApprovalMode = "ask" | "auto" | "bypass"

export const APPROVAL_MODES: { id: ApprovalMode; label: string; description: string }[] = [
  { id: "ask", label: "Ask every time", description: "Every command waits for you to approve it." },
  { id: "auto", label: "Auto", description: "Simple read-only commands and plain arithmetic run without asking. Anything else still waits." },
  { id: "bypass", label: "Never ask", description: "Runs every command without asking. Only for work you trust." },
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

/** Another tab changed the choice: forget the cached one so every tab follows what is saved. */
function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== KEY) return
  current = null
  listeners.forEach((l) => l())
}

export function subscribeApprovalMode(listener: () => void): () => void {
  // Without this, turning Bypass off in one tab left it on in the others until they reloaded.
  if (listeners.size === 0) window.addEventListener("storage", onStorage)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) window.removeEventListener("storage", onStorage)
  }
}

export function currentApprovalMode(): ApprovalMode {
  current ??= readApprovalMode()
  return current
}
