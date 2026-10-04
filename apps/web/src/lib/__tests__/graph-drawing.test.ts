import { describe, it, expect } from "vitest"
import { fitZoom, nodeRadius, relationLabel, shortLabel } from "../graph"

describe("graph drawing helpers", () => {
  it("sizes nodes by importance within a readable range", () => {
    expect(nodeRadius(1)).toBeCloseTo(6.8)
    expect(nodeRadius(5)).toBeCloseTo(10)
    expect(nodeRadius(10)).toBeCloseTo(14)
    // Out-of-range and missing scores can't produce a giant or invisible node.
    expect(nodeRadius(500)).toBeCloseTo(14)
    expect(nodeRadius(-3)).toBeCloseTo(6.8)
    expect(nodeRadius(null)).toBeCloseTo(10)
    expect(nodeRadius(undefined)).toBeCloseTo(10)
    expect(nodeRadius(NaN)).toBeCloseTo(10)
  })

  it("writes relations the way people read them", () => {
    expect(relationLabel("BUILT_ON")).toBe("built on")
    expect(relationLabel("ARCHITECTURAL_COMPONENT_OF")).toBe("architectural component of")
    expect(relationLabel("uses")).toBe("uses")
    expect(relationLabel(null)).toBe("")
  })

  it("shortens long names only", () => {
    expect(shortLabel("Next.js")).toBe("Next.js")
    expect(shortLabel("A very long entity name that keeps on going")).toBe("A very long entity name tha…")
    expect(shortLabel("A very long entity name that keeps on going").length).toBe(28)
  })

  it("fits a large graph in the view and never blows up a tiny one", () => {
    const view = { width: 1000, height: 700 }
    expect(fitZoom(view, { width: 4200, height: 1000 })).toBeCloseTo(0.2)
    expect(fitZoom(view, { width: 500, height: 2700 })).toBeCloseTo(0.2)
    // Three nodes close together: capped, not zoomed to fill the screen.
    expect(fitZoom(view, { width: 120, height: 90 })).toBe(2)
    expect(fitZoom(view, { width: 0, height: 0 })).toBe(2)
    // A view that hasn't been measured yet still gives a usable zoom.
    expect(fitZoom({ width: 0, height: 0 }, { width: 300, height: 300 })).toBe(0.05)
  })
})
