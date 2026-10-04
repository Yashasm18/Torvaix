import { describe, it, expect, beforeEach } from "vitest"
import { selectShownTurn, useAnswerDetailsStore } from "../answer-details-store"
import type { AnswerTurn } from "@/lib/answer-details"

const turn = (id: string, over: Partial<AnswerTurn> = {}): AnswerTurn => ({
  id,
  route: "conversation",
  model: null,
  totalMs: 0,
  retrievedMemories: [{ id: "m1", content: "Tea over coffee", source: "Chat", score: 0.9, match: "keyword" }],
  savedMemory: null,
  savedUndone: false,
  awaitingApproval: null,
  steps: [],
  entities: [],
  relationships: [],
  ...over,
})

const store = () => useAnswerDetailsStore.getState()

describe("answer details store", () => {
  beforeEach(() => store().reset())

  it("shows the latest reply, or an earlier one when it is selected", () => {
    const first = turn("t1")
    const second = turn("t2")
    store().record(first)
    store().attach("msg-1", first)
    store().record(second)
    store().attach("msg-2", second)
    expect(selectShownTurn(store())?.id).toBe("t2")

    store().select("msg-1")
    expect(selectShownTurn(store())?.id).toBe("t1")

    // A new reply takes over again.
    store().record(turn("t3"))
    expect(selectShownTurn(store())?.id).toBe("t3")
  })

  it("falls back to the latest reply when the selected message has no details", () => {
    store().record(turn("t1"))
    store().select("restored-from-storage")
    expect(selectShownTurn(store())?.id).toBe("t1")
  })

  it("keeps every reply in step when a memory is edited or deleted", () => {
    const first = turn("t1")
    const second = turn("t2", { savedMemory: { id: "m2", content: "I use pnpm" }, route: "knowledge" })
    store().record(first)
    store().attach("msg-1", first)
    store().record(second)
    store().attach("msg-2", second)

    store().updateMemory("m1", "Coffee over tea")
    expect(store().byMessage["msg-1"].retrievedMemories[0].content).toBe("Coffee over tea")
    expect(store().latest!.retrievedMemories[0].content).toBe("Coffee over tea")

    store().removeMemory("m1")
    expect(store().byMessage["msg-1"].retrievedMemories).toEqual([])

    store().removeMemory("m2")
    expect(store().latest).toMatchObject({ savedMemory: null, savedUndone: true })
    expect(store().byMessage["msg-1"].savedUndone).toBe(false)
  })

  it("counts requests to open the panel and forgets everything on reset", () => {
    const before = store().openRequests
    store().requestOpen()
    expect(store().openRequests).toBe(before + 1)

    store().record(turn("t1"))
    store().attach("msg-1", turn("t1"))
    store().reset()
    expect(store()).toMatchObject({ latest: null, byMessage: {}, selectedMessageId: null })
  })
})
