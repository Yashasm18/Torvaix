import { describe, it, expect } from "vitest"
import { describeTrigger } from "../automation-schedule"
import { countConnections, linkEndpointId } from "../graph"

describe("describeTrigger", () => {
  it("describes schedules as the engine runs them", () => {
    expect(describeTrigger("schedule", { frequency: "interval", intervalMinutes: 30 })).toBe("Every 30 min")
    expect(describeTrigger("schedule", { frequency: "hourly" })).toBe("Hourly")
    expect(describeTrigger("schedule", { frequency: "daily", timeOfDay: "09:00" })).toBe("Daily at 09:00")
    expect(describeTrigger("schedule", { frequency: "daily" })).toBe("Daily")
    expect(describeTrigger("schedule", { frequency: "weekly", dayOfWeek: 0, timeOfDay: "02:00" })).toBe("Weekly on Sunday at 02:00")
    expect(describeTrigger("schedule", { frequency: "weekly", timeOfDay: "09:00" })).toBe("Weekly at 09:00")
  })

  it("describes event and manual triggers", () => {
    expect(describeTrigger("event", { eventName: "MEMORY_CREATED", filterPattern: "React" })).toBe('Event: MEMORY_CREATED ("React")')
    expect(describeTrigger("manual")).toBe("Manual / On-Demand")
  })
})

describe("graph connections", () => {
  it("counts links whether force-graph has replaced ids with node objects or not", () => {
    const links = [
      { source: "a", target: "b" },
      { source: { id: "b" }, target: { id: "c" } },
      { source: { id: "c" }, target: "a" },
    ]
    expect(countConnections(links, "a")).toBe(2)
    expect(countConnections(links, "b")).toBe(2)
    expect(countConnections(links, "z")).toBe(0)
    expect(linkEndpointId(null)).toBeUndefined()
  })
})
