export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const

export interface TriggerConfigLike {
  frequency?: string
  intervalMinutes?: number
  timeOfDay?: string
  dayOfWeek?: number
  eventName?: string
  filterPattern?: string
}

/** What each event means, in the words the Automations page uses when you pick one. */
export const EVENT_LABELS: Record<string, string> = {
  MEMORY_CREATED: "a memory is saved",
  MEMORY_UPDATED: "a memory is edited",
  MEMORY_DELETED: "a memory is deleted",
  TASK_CREATED: "a task is started",
  TASK_COMPLETED: "a task finishes",
  AGENT_STARTED: "the agent starts a run",
  AGENT_FINISHED: "the agent finishes a run",
}

/**
 * Human-readable trigger, matching what the scheduler actually does. The old labels showed
 * made-up defaults ("Daily at 09:00", "Weekly at 02:00") for workflows without a time and
 * never mentioned the weekday.
 */
export function describeTrigger(triggerType: string, config: TriggerConfigLike = {}): string {
  if (triggerType === "manual") return "Manual"
  if (triggerType === "event") {
    const what = (config.eventName && EVENT_LABELS[config.eventName]) || config.eventName || "an event happens"
    return `When ${what}${config.filterPattern ? ` containing "${config.filterPattern}"` : ""}`
  }

  const frequency = config.frequency || "interval"
  const at = config.timeOfDay ? ` at ${config.timeOfDay}` : ""
  switch (frequency) {
    case "interval":
      return `Every ${Math.max(1, Number(config.intervalMinutes) || 60)} min`
    case "hourly":
      return "Hourly"
    case "daily":
      return `Daily${at}`
    case "weekly": {
      const day = typeof config.dayOfWeek === "number" ? WEEKDAYS[config.dayOfWeek] : undefined
      return `Weekly${day ? ` on ${day}` : ""}${at}`
    }
    default:
      return "Scheduled"
  }
}
