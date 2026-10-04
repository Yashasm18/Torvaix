import { describe, it, expect } from "vitest"
import { describeStep, formatDuration, matchLabel, normalizeTurn, summarizeTurn, toolsUsed, type AnswerTurn } from "../answer-details"

const turn = (over: Partial<AnswerTurn> = {}): AnswerTurn => ({
  id: "t1",
  route: "conversation",
  model: "llama3.2:3b",
  totalMs: 1200,
  retrievedMemories: [],
  savedMemory: null,
  savedUndone: false,
  awaitingApproval: null,
  steps: [],
  entities: [],
  relationships: [],
  ...over,
})

const memory = (id: string, match: "keyword" | "recent" = "keyword") => ({ id, content: `memory ${id}`, source: "Chat", score: 0.8, match })

describe("normalizeTurn", () => {
  it("reads what the agent sends", () => {
    const parsed = normalizeTurn({
      id: "p1",
      route: "memory",
      model: "llama3.2:3b",
      totalMs: 3400.5,
      retrievedMemories: [{ id: "m1", content: "Tea over coffee", source: "User Chat", score: 0.75, match: "hybrid_rrf", createdAt: "2026-10-01 09:00:00" }],
      savedMemory: null,
      awaitingApproval: null,
      steps: [{ phase: "router", action: "Classifying request", durationMs: 400 }],
      detectedEntities: [{ text: "Tea", type: "PRODUCT" }],
      relationships: [{ source: "I", relation: "prefer", target: "Tea" }],
    })
    expect(parsed).toMatchObject({
      id: "p1",
      route: "memory",
      retrievedMemories: [{ id: "m1", match: "hybrid_rrf", createdAt: "2026-10-01 09:00:00" }],
      steps: [{ phase: "router", durationMs: 400 }],
      entities: [{ text: "Tea", type: "PRODUCT" }],
      relationships: [{ source: "I", relation: "prefer", target: "Tea" }],
    })
  })

  it("copes with an older agent that sends fewer fields, and with junk", () => {
    const old = normalizeTurn({ id: "p0", retrievedMemories: [{ id: "m1", content: "x", source: "s", score: 1 }, { nope: true }, null], agentSteps: ["router: x"] })
    expect(old).toMatchObject({ id: "p0", route: null, model: null, totalMs: 0, savedMemory: null, steps: [] })
    expect(old!.retrievedMemories).toEqual([{ id: "m1", content: "x", source: "s", score: 1, match: "keyword", createdAt: undefined }])

    expect(normalizeTurn(null)).toBeNull()
    expect(normalizeTurn("text")).toBeNull()
    expect(normalizeTurn({ route: "memory" })).toBeNull()
    expect(normalizeTurn({ id: "p", route: "made-up", savedMemory: { id: 5 } })).toMatchObject({ route: null, savedMemory: null })
  })
})

describe("summarizeTurn", () => {
  it("says what a chat answer was based on", () => {
    expect(summarizeTurn(turn())).toBe("Answered from the model alone. No saved memory matched.")
    expect(summarizeTurn(turn({ retrievedMemories: [memory("a")] }))).toBe("Answered using 1 saved memory.")
    expect(summarizeTurn(turn({ retrievedMemories: [memory("a"), memory("b")] }))).toBe("Answered using 2 saved memories.")
  })

  it("tells a real match from the fallback to recent memories", () => {
    expect(summarizeTurn(turn({ route: "memory", retrievedMemories: [memory("a")] }))).toBe("Answered from 1 saved memory.")
    expect(summarizeTurn(turn({ route: "memory", retrievedMemories: [memory("a", "recent"), memory("b", "recent")] }))).toBe(
      "Nothing matched closely, so I read your 2 most recent memories."
    )
    expect(summarizeTurn(turn({ route: "memory" }))).toBe("Looked for saved memories and found none.")
  })

  it("reports what was saved, including after an undo", () => {
    const saved = { id: "m9", content: "Remember that I use pnpm" }
    expect(summarizeTurn(turn({ route: "knowledge", savedMemory: saved }))).toBe("Saved 1 new memory.")
    expect(summarizeTurn(turn({ route: "knowledge", savedMemory: saved, entities: [{ text: "pnpm", type: "TOOL" }] }))).toBe(
      "Saved 1 new memory and added 1 item to the knowledge graph."
    )
    expect(summarizeTurn(turn({ route: "knowledge", savedUndone: true }))).toBe("Saved a memory, which you then removed.")
    expect(summarizeTurn(turn({ route: "knowledge" }))).toBe("Tried to save a memory, but it didn't work.")
  })

  it("covers tools, approvals and the other routes", () => {
    const steps = [
      { phase: "tool_call", action: "Tool: write_file", durationMs: 12 },
      { phase: "execution", action: "Planning and tool execution", durationMs: 900 },
      { phase: "tool_call", action: "Tool: write_file", durationMs: 9 },
      { phase: "tool_call", action: "Tool: web_search", durationMs: 2100 },
    ]
    expect(toolsUsed(turn({ steps }))).toEqual(["write_file", "web_search"])
    expect(summarizeTurn(turn({ route: "execution", steps }))).toBe("Ran write_file, web_search.")
    expect(summarizeTurn(turn({ route: "execution" }))).toBe("Worked out the next step without running a tool.")
    expect(summarizeTurn(turn({ route: "execution", awaitingApproval: "bash" }))).toBe("Waiting for your approval to run bash.")
    expect(summarizeTurn(turn({ route: "repo_analysis" }))).toBe("Scanned the workspace folder.")
    expect(summarizeTurn(turn({ route: "identity" }))).toBe("Answered directly, without asking the model.")
    expect(summarizeTurn(turn({ route: null }))).toBe("No details were recorded for this reply.")
  })
})

describe("labels", () => {
  it("describes steps in plain words", () => {
    expect(describeStep({ phase: "router", action: "Classifying request" })).toBe("Decided how to handle the message")
    expect(describeStep({ phase: "knowledge", action: "Storing memory" })).toBe("Saved the memory")
    expect(describeStep({ phase: "knowledge", action: "NLP intelligence extraction" })).toBe("Looked for names and links to add to the graph")
    expect(describeStep({ phase: "tool_call", action: "Tool: bash" })).toBe("Ran bash")
    expect(describeStep({ phase: "something_new", action: "Did a thing" })).toBe("Did a thing")
  })

  it("explains why a memory was picked", () => {
    expect(matchLabel("keyword")).toBe("matched your words")
    expect(matchLabel("vector")).toBe("similar in meaning")
    expect(matchLabel("hybrid_rrf")).toBe("matched words and meaning")
    expect(matchLabel("recent")).toBe("one of your latest")
  })

  it("formats durations", () => {
    expect(formatDuration(3)).toBe("0.1 s")
    expect(formatDuration(420)).toBe("0.4 s")
    expect(formatDuration(12_400)).toBe("12 s")
    expect(formatDuration(65_000)).toBe("1 min 5 s")
    expect(formatDuration(NaN)).toBe("")
  })
})
