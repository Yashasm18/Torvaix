import { describe, it, expect } from "vitest"
import type { Chat } from "@torvaix/types"
import {
  MAX_STORED_MESSAGES,
  deriveChatTitle,
  formatAttachment,
  messagesSignature,
  pickActiveChat,
  stripActionMarker,
  toStoredMessages,
  toUiMessages,
} from "../chat-history"

const chat = (id: string, workspaceId: string, updatedAt: string): Chat => ({
  id,
  workspaceId,
  title: id,
  createdAt: new Date(updatedAt),
  updatedAt: new Date(updatedAt),
})

describe("chat history", () => {
  it("hides the internal pending-action marker", () => {
    expect(stripActionMarker("I have approved the action.\n__PENDING_ACTION_ID__:3f2a-9b")).toBe("I have approved the action.")
  })

  it("titles a chat from the first real user message", () => {
    expect(deriveChatTitle([{ role: "assistant", content: "Hi" }, { role: "user", content: "  Plan my\nweek  " }])).toBe("Plan my week")
    expect(deriveChatTitle([{ role: "user", content: "__PENDING_ACTION_ID__:abc" }])).toBeNull()
    expect(deriveChatTitle([{ role: "user", content: "x".repeat(100) }], 10)).toBe("xxxxxxxxx…")
  })

  it("stores only chat roles, keeps tool calls, and caps history", () => {
    const many = Array.from({ length: MAX_STORED_MESSAGES + 5 }, (_, i) => ({ id: `m${i}`, role: "user", content: `${i}` }))
    const stored = toStoredMessages("c1", [...many, { id: "d", role: "data", content: "" }])
    expect(stored).toHaveLength(MAX_STORED_MESSAGES)
    expect(stored[0].id).toBe("m5")
    expect(stored.every((m) => m.chatId === "c1")).toBe(true)

    const [withTools] = toStoredMessages("c1", [{ id: "a", role: "assistant", content: "", toolInvocations: [{ toolName: "bash" }] }])
    expect(withTools.toolInvocations).toHaveLength(1)
  })

  it("round-trips through JSON persistence", () => {
    const stored = toStoredMessages("c1", [{ id: "u", role: "user", content: "hello", createdAt: new Date("2026-09-15T10:00:00Z") }])
    const persisted = JSON.parse(JSON.stringify(stored))
    const [restored] = toUiMessages(persisted, "c1")
    expect(restored).toMatchObject({ id: "u", role: "user", content: "hello" })
    expect((restored.createdAt as Date).toISOString()).toBe("2026-09-15T10:00:00.000Z")
    expect(toUiMessages(persisted, "other")).toEqual([])
  })

  it("picks the selected chat, else the most recent one in that workspace", () => {
    const chats = [chat("old", "ws", "2026-09-01"), chat("new", "ws", "2026-09-10"), chat("elsewhere", "other", "2026-09-12")]
    expect(pickActiveChat(chats, "ws", "old")?.id).toBe("old")
    expect(pickActiveChat(chats, "ws", "elsewhere")?.id).toBe("new")
    expect(pickActiveChat(chats, "ws", undefined)?.id).toBe("new")
    expect(pickActiveChat(chats, "empty", undefined)).toBeNull()
  })

  it("detects streamed content changes", () => {
    const before = messagesSignature([{ id: "a", role: "assistant", content: "Hel" }])
    const after = messagesSignature([{ id: "a", role: "assistant", content: "Hello" }])
    expect(before).not.toBe(after)
  })

  it("fences attachments safely even when they contain backticks", () => {
    expect(formatAttachment("a.md", "plain\n")).toBe("File: a.md\n```\nplain\n```")
    const tricky = formatAttachment("b.md", "text ```` more")
    expect(tricky.startsWith("File: b.md\n`````\n")).toBe(true)
    expect(tricky.endsWith("\n`````")).toBe(true)
  })
})
