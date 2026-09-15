export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const

export interface TriggerConfigLike {
  frequency?: string
  intervalMinutes?: number
  timeOfDay?: string
  dayOfWeek?: number
  eventName?: string
  filterPattern?: string
}

/**
 * Human-readable trigger, matching what the scheduler actually does. The old labels showed
 * made-up defaults ("Daily at 09:00", "Weekly at 02:00") for workflows without a time and
 * never mentioned the weekday.
 */
export function describeTrigger(triggerType: string, config: TriggerConfigLike = {}): string {
  if (triggerType === "manual") return "Manual / On-Demand"
  if (triggerType === "event") {
    return `Event: ${config.eventName || "Event"}${config.filterPattern ? ` ("${config.filterPattern}")` : ""}`
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
