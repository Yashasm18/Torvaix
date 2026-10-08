import { describe, it, expect } from "vitest"
import { LIMITS } from "../../../../../packages/agent/src/validation"
import { DESCRIPTION_MAX, INSTRUCTIONS_MAX, NAME_MAX, TASK_MAX } from "../agent-form"

// The form checks text before it is sent, and the agent server checks it again. If the two
// numbers drift apart, the form either blocks text the server accepts or lets through text the
// server rejects.
describe("the agent form's limits match the agent server's", () => {
  it("name", () => {
    expect(NAME_MAX).toBe(LIMITS.agentNameChars)
  })

  it("description", () => {
    expect(DESCRIPTION_MAX).toBe(LIMITS.agentDescriptionChars)
  })

  it("instructions", () => {
    expect(INSTRUCTIONS_MAX).toBe(LIMITS.agentInstructionsChars)
  })

  it("task", () => {
    expect(TASK_MAX).toBe(LIMITS.instructionsChars)
  })
})
