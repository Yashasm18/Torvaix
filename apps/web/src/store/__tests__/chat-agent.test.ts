import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest"

// The store saves to IndexedDB, which doesn't exist here. Keep the saved state in a map so a test
// can look at exactly what would have been written to disk.
const disk = vi.hoisted(() => new Map<string, string>())
vi.mock("idb-keyval", () => ({
  get: async (key: string) => disk.get(key),
  set: async (key: string, value: string) => {
    disk.set(key, value)
  },
  del: async (key: string) => {
    disk.delete(key)
  },
}))

import { selectChatAgentId, useDBStore } from "../db-store"

const store = () => useDBStore.getState()
const agentOf = (chatId: string) => selectChatAgentId(store(), chatId)
const saved = () => JSON.parse(disk.get("torvaix-db") ?? "{}") as { state?: { chatAgentIds?: Record<string, string> } }

describe("chat agent choice", () => {
  beforeAll(async () => {
    await useDBStore.persist.rehydrate()
  })

  beforeEach(() => {
    disk.clear()
    useDBStore.setState({ workspaces: [], chats: [], messages: [], activeChatIds: {}, chatAgentIds: {} })
  })

  it("remembers the agent chosen for each chat separately", () => {
    store().setChatAgent("chat-a", "agent-1")
    store().setChatAgent("chat-b", "agent-2")

    expect(agentOf("chat-a")).toBe("agent-1")
    expect(agentOf("chat-b")).toBe("agent-2")
    expect(agentOf("chat-without-one")).toBeNull()

    // Choosing again replaces the earlier choice for that chat only.
    store().setChatAgent("chat-a", "agent-3")
    expect(agentOf("chat-a")).toBe("agent-3")
    expect(agentOf("chat-b")).toBe("agent-2")
  })

  it("goes back to the default assistant when the choice is cleared", () => {
    store().setChatAgent("chat-a", "agent-1")
    store().setChatAgent("chat-b", "agent-2")

    store().setChatAgent("chat-a", null)
    expect(agentOf("chat-a")).toBeNull()
    expect("chat-a" in store().chatAgentIds).toBe(false)
    expect(agentOf("chat-b")).toBe("agent-2")

    // An empty id is no choice either, so it can never be sent as an agent.
    store().setChatAgent("chat-b", "")
    expect(store().chatAgentIds).toEqual({})
  })

  it("does not touch the state when nothing changes", () => {
    store().setChatAgent("chat-a", "agent-1")
    const before = store().chatAgentIds

    store().setChatAgent("chat-a", "agent-1")
    store().setChatAgent("chat-never-set", null)

    expect(store().chatAgentIds).toBe(before)
  })

  it("is saved with the rest of the state", () => {
    store().setChatAgent("chat-a", "agent-1")

    expect(saved().state?.chatAgentIds).toEqual({ "chat-a": "agent-1" })
  })

  it("copes with saved state from before agents existed", async () => {
    // What an older build wrote: no chatAgentIds at all.
    disk.set(
      "torvaix-db",
      JSON.stringify({
        state: { workspaces: [], chats: [{ id: "old-chat", workspaceId: "default", title: "Old", createdAt: "2026-06-01T10:00:00.000Z", updatedAt: "2026-06-01T10:00:00.000Z" }], notes: [], messages: [], projects: [], activeChatIds: {}, activeWorkspaceId: null },
        version: 1,
      })
    )
    await useDBStore.persist.rehydrate()

    expect(store().chats.map((c) => c.id)).toEqual(["old-chat"])
    expect(agentOf("old-chat")).toBeNull()
    store().setChatAgent("old-chat", "agent-1")
    expect(agentOf("old-chat")).toBe("agent-1")
  })

  it("never fails on a missing chatAgentIds", () => {
    const missing = { chatAgentIds: undefined } as unknown as Partial<ReturnType<typeof store>>
    useDBStore.setState({ ...missing, chats: [{ id: "chat-a", workspaceId: "ws-1", title: "A", createdAt: new Date(), updatedAt: new Date() }] })

    expect(agentOf("chat-a")).toBeNull()
    expect(selectChatAgentId({}, "chat-a")).toBeNull()

    expect(() => store().deleteChat("chat-a")).not.toThrow()
    expect(store().chatAgentIds).toEqual({})

    useDBStore.setState({ ...missing })
    expect(() => store().deleteWorkspace("ws-1")).not.toThrow()
    expect(store().chatAgentIds).toEqual({})

    useDBStore.setState({ ...missing })
    store().setChatAgent("chat-a", "agent-1")
    expect(agentOf("chat-a")).toBe("agent-1")
  })

  it("forgets a chat's agent when the chat is deleted", () => {
    const keep = store().createChat("ws-1", "Keep")
    const drop = store().createChat("ws-1", "Drop")
    store().setChatAgent(keep.id, "agent-1")
    store().setChatAgent(drop.id, "agent-2")

    store().deleteChat(drop.id)

    expect(store().chatAgentIds).toEqual({ [keep.id]: "agent-1" })
    expect(saved().state?.chatAgentIds).toEqual({ [keep.id]: "agent-1" })
  })

  it("forgets every chat's agent in a workspace when the workspace is deleted", () => {
    const first = store().createChat("ws-1", "First")
    const second = store().createChat("ws-1", "Second")
    const other = store().createChat("ws-2", "Other")
    store().setChatAgent(first.id, "agent-1")
    store().setChatAgent(second.id, "agent-2")
    store().setChatAgent(other.id, "agent-3")

    store().deleteWorkspace("ws-1")

    expect(store().chatAgentIds).toEqual({ [other.id]: "agent-3" })
    expect(store().chats.map((c) => c.id)).toEqual([other.id])
  })
})
