import { describe, it, expect } from "vitest"
import { MAX_MESSAGE_CHARS, toAgentRequest } from "../chat-request"

const user = (content: string) => ({ role: "user", content })
const assistant = (content: string, toolInvocations?: unknown[]) => ({ role: "assistant", content, ...(toolInvocations ? { toolInvocations } : {}) })
const ran = (toolName: string, output: string) => ({ state: "result", toolName, args: {}, result: { output } })
const approve = (id: string) => user(`I have approved the action.\n__PENDING_ACTION_ID__:${id}`)

describe("toAgentRequest", () => {
  it("sends the last message as the task and the rest as history", () => {
    expect(toAgentRequest([user("hi"), assistant("Hello!"), user("What is a monorepo?")])).toEqual({
      instructions: "What is a monorepo?",
      history: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "Hello!" },
      ],
    })
  })

  it("needs a last message with text", () => {
    expect(toAgentRequest([])).toBeNull()
    expect(toAgentRequest(undefined)).toBeNull()
    expect(toAgentRequest([{ role: "user", content: 3 }])).toBeNull()
  })

  it("keeps the user's request as the task when an approval is resumed", () => {
    const request = toAgentRequest([user("Run ls"), assistant("Pending Action ID: `abc-1`"), approve("abc-1")])
    expect(request?.instructions).toBe("Run ls")
    expect(request?.pendingActionId).toBe("abc-1")
    expect(request?.history.some((m) => m.content.includes("approved the action"))).toBe(false)
  })

  it("passes on the results of commands that already ran, so a second approval still knows the first result", () => {
    const request = toAgentRequest([
      user("Run ls and then pwd and tell me both"),
      assistant("Pending Action ID: `abc-1`"),
      approve("abc-1"),
      assistant("Pending Action ID: `abc-2`", [ran("bash", "notes.txt")]),
      approve("abc-2"),
    ])
    expect(request?.instructions).toBe("Run ls and then pwd and tell me both")
    expect(request?.pendingActionId).toBe("abc-2")
    expect(request?.history).toContainEqual({ role: "system", content: "Tool bash Result: notes.txt" })
  })

  it("leaves out calls that have not finished and anything that is not a chat message", () => {
    const request = toAgentRequest([
      assistant("", [{ state: "call", toolName: "bash", args: {} }, ran("read_file", "contents")]),
      { role: "data", content: "x" },
      null,
      user("next"),
    ])
    expect(request?.history).toEqual([{ role: "system", content: "Tool read_file Result: contents" }])
  })

  it("never sends a history entry longer than the server accepts", () => {
    const request = toAgentRequest([user("x".repeat(MAX_MESSAGE_CHARS + 5000)), assistant("too long"), user("hi")])
    expect(request?.history[0].content.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS)
    expect(request?.instructions).toBe("hi")
  })
})
