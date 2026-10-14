import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest"

// The store saves to IndexedDB, which doesn't exist here.
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

import { useDBStore } from "../db-store"
import { DEFAULT_CHAT_TITLE, isDefaultChatTitle } from "../chat-history"

const store = () => useDBStore.getState()

describe("workspace templates", () => {
  beforeAll(async () => {
    // No agent server in unit tests: registering the workspace fails, which the store tolerates.
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline") }))
    vi.spyOn(console, "error").mockImplementation(() => {})
    await useDBStore.persist.rehydrate()
  })

  beforeEach(() => {
    disk.clear()
    useDBStore.setState({ workspaces: [], chats: [], messages: [], notes: [], projects: [], activeChatIds: {}, chatAgentIds: {} })
  })

  it("starts a blank workspace with one new chat", async () => {
    const ws = await store().createWorkspace("Blank", "general")
    expect(store().chats.filter((c) => c.workspaceId === ws.id).map((c) => c.title)).toEqual([DEFAULT_CHAT_TITLE])
    expect(store().projects.filter((p) => p.workspaceId === ws.id)).toHaveLength(0)
  })

  it("gives template content the user can see: a named chat and projects, not hidden notes", async () => {
    const ws = await store().createWorkspace("Uni", "university")
    expect(store().chats.filter((c) => c.workspaceId === ws.id).map((c) => c.title)).toEqual(["Course discussion"])
    expect(store().projects.filter((p) => p.workspaceId === ws.id).map((p) => p.name).sort()).toEqual(["Assignments", "References"])
    expect(store().notes).toHaveLength(0)
  })
})

describe("isDefaultChatTitle", () => {
  it("knows the current and the old spelling, so older chats are still named by their first message", () => {
    expect(isDefaultChatTitle("New chat")).toBe(true)
    expect(isDefaultChatTitle("New Chat")).toBe(true)
    expect(isDefaultChatTitle("Course discussion")).toBe(false)
  })
})
