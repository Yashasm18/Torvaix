/** Sent on window when something the sidebar counts (approvals, automations) may have changed. */
export const ACTIVITY_CHANGED_EVENT = "torvaix:activity-changed"

export function announceActivityChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ACTIVITY_CHANGED_EVENT))
}
