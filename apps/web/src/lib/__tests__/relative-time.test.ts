import { describe, it, expect } from "vitest"
import { formatRelativeTime } from "../relative-time"

const NOW = Date.UTC(2026, 8, 14, 12, 0, 0)

describe("formatRelativeTime", () => {
  it("returns a dash for missing or invalid dates", () => {
    expect(formatRelativeTime(null, NOW)).toBe("—")
    expect(formatRelativeTime("not a date", NOW)).toBe("—")
  })

  it("collapses the last minute to 'just now'", () => {
    expect(formatRelativeTime(NOW - 20_000, NOW)).toBe("just now")
  })

  it("picks the largest whole unit", () => {
    expect(formatRelativeTime(NOW - 5 * 60_000, NOW)).toMatch(/5 minutes ago/)
    expect(formatRelativeTime(NOW - 3 * 60 * 60_000, NOW)).toMatch(/3 hours ago/)
    expect(formatRelativeTime(new Date(NOW - 2 * 7 * 24 * 60 * 60_000).toISOString(), NOW)).toMatch(/2 weeks ago/)
  })
})
