import { describe, it, expect } from "vitest"
import { latestProgress } from "../progress"
import { toApprovalMode } from "../approval-mode"

const step = (runId: string, label: string, detail?: string) => ({ torvaixProgress: { runId, label, detail } })

describe("latestProgress", () => {
  it("returns the steps of the newest run only", () => {
    const data = [step("a", "Writing a reply"), { torvaixPulse: {} }, step("b", "Planning the next step"), step("b", "Running bash", "ls")]
    expect(latestProgress(data)).toEqual([{ label: "Planning the next step" }, { label: "Running bash", detail: "ls" }])
  })

  it("collapses a repeated line and ignores anything that is not a step", () => {
    const data = [step("a", "Thinking", "x"), step("a", "Thinking", "x"), null, "text", { torvaixProgress: { label: 3 } }, step("a", "Thinking", "y")]
    expect(latestProgress(data)).toEqual([{ label: "Thinking", detail: "x" }, { label: "Thinking", detail: "y" }])
  })

  it("is empty without data", () => {
    expect(latestProgress(undefined)).toEqual([])
    expect(latestProgress([])).toEqual([])
  })
})

describe("toApprovalMode", () => {
  it("only accepts the known modes", () => {
    expect(toApprovalMode("auto")).toBe("auto")
    expect(toApprovalMode("bypass")).toBe("bypass")
    for (const value of [null, undefined, "", "ASK", "always"]) expect(toApprovalMode(value)).toBe("ask")
  })
})
