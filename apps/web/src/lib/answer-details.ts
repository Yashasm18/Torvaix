/**
 * What the agent did for one chat reply, as shown in the "How I answered" panel. The agent
 * sends this with each reply (the `torvaixPulse` stream annotation).
 */

export type MemoryMatch = "keyword" | "vector" | "hybrid_rrf" | "recent"

export interface TurnMemory {
  id: string
  content: string
  source: string
  score: number
  match: MemoryMatch
  createdAt?: string
}

export interface TurnStep {
  phase: string
  action: string
  durationMs?: number
}

export interface AnswerTurn {
  id: string
  route: "identity" | "memory" | "knowledge" | "conversation" | "execution" | "repo_analysis" | null
  model: string | null
  totalMs: number
  retrievedMemories: TurnMemory[]
  savedMemory: { id: string; content: string } | null
  /** The user removed the memory this turn saved (Undo in the panel). */
  savedUndone: boolean
  awaitingApproval: string | null
  steps: TurnStep[]
  entities: { text: string; type: string }[]
  relationships: { source: string; relation: string; target: string }[]
}

const ROUTES = ["identity", "memory", "knowledge", "conversation", "execution", "repo_analysis"]
const MATCHES = ["keyword", "vector", "hybrid_rrf", "recent"]

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((v): v is Record<string, unknown> => !!v && typeof v === "object") : []
}

/** Reads the agent's annotation defensively: an older agent sends fewer fields. Returns null if it isn't one. */
export function normalizeTurn(raw: unknown): AnswerTurn | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== "string") return null
  const saved = r.savedMemory as { id?: unknown; content?: unknown } | null | undefined

  return {
    id: r.id,
    route: typeof r.route === "string" && ROUTES.includes(r.route) ? (r.route as AnswerTurn["route"]) : null,
    model: typeof r.model === "string" && r.model ? r.model : null,
    totalMs: typeof r.totalMs === "number" && Number.isFinite(r.totalMs) ? r.totalMs : 0,
    retrievedMemories: asArray(r.retrievedMemories)
      .filter((m) => typeof m.id === "string" && typeof m.content === "string")
      .map((m) => ({
        id: m.id as string,
        content: m.content as string,
        source: typeof m.source === "string" ? m.source : "",
        score: typeof m.score === "number" ? m.score : 0,
        match: typeof m.match === "string" && MATCHES.includes(m.match) ? (m.match as MemoryMatch) : "keyword",
        createdAt: typeof m.createdAt === "string" ? m.createdAt : undefined,
      })),
    savedMemory: saved && typeof saved.id === "string" && typeof saved.content === "string" ? { id: saved.id, content: saved.content } : null,
    savedUndone: false,
    awaitingApproval: typeof r.awaitingApproval === "string" ? r.awaitingApproval : null,
    steps: asArray(r.steps)
      .filter((s) => typeof s.phase === "string" && typeof s.action === "string")
      .map((s) => ({
        phase: s.phase as string,
        action: s.action as string,
        durationMs: typeof s.durationMs === "number" ? s.durationMs : undefined,
      })),
    entities: asArray(r.detectedEntities)
      .filter((e) => typeof e.text === "string")
      .map((e) => ({ text: e.text as string, type: typeof e.type === "string" ? e.type : "" })),
    relationships: asArray(r.relationships)
      .filter((l) => typeof l.source === "string" && typeof l.relation === "string" && typeof l.target === "string")
      .map((l) => ({ source: l.source as string, relation: l.relation as string, target: l.target as string })),
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Names of the tools a turn ran, in order, without repeats. */
export function toolsUsed(turn: AnswerTurn): string[] {
  const names = turn.steps.filter((s) => s.phase === "tool_call").map((s) => s.action.replace(/^Tool:\s*/, ""))
  return Array.from(new Set(names))
}

/** One sentence saying what the answer was based on. */
export function summarizeTurn(turn: AnswerTurn): string {
  if (turn.awaitingApproval) return `Waiting for your approval to run ${turn.awaitingApproval}.`

  const memories = turn.retrievedMemories.length
  switch (turn.route) {
    case "knowledge": {
      if (turn.savedUndone) return "Saved a memory, which you then removed."
      if (!turn.savedMemory) return "Tried to save a memory, but it didn't work."
      const graph = turn.entities.length + turn.relationships.length
      return graph > 0
        ? `Saved 1 new memory and added ${plural(graph, "item", "items")} to the knowledge graph.`
        : "Saved 1 new memory."
    }
    case "memory":
      if (memories === 0) return "Looked for saved memories and found none."
      if (turn.retrievedMemories.every((m) => m.match === "recent")) {
        return `Nothing matched closely, so I read your ${plural(memories, "most recent memory", "most recent memories")}.`
      }
      return `Answered from ${plural(memories, "saved memory", "saved memories")}.`
    case "conversation":
      return memories > 0
        ? `Answered using ${plural(memories, "saved memory", "saved memories")}.`
        : "Answered from the model alone. No saved memory matched."
    case "execution": {
      const tools = toolsUsed(turn)
      return tools.length > 0 ? `Ran ${tools.join(", ")}.` : "Worked out the next step without running a tool."
    }
    case "repo_analysis":
      return "Scanned the workspace folder."
    case "identity":
      return "Answered directly, without asking the model."
    default:
      return "No details were recorded for this reply."
  }
}

/** A step of the agent's work in plain words. */
export function describeStep(step: TurnStep): string {
  switch (step.phase) {
    case "router":
      return "Decided how to handle the message"
    case "memory":
      return "Searched saved memories and wrote the answer"
    case "conversation":
      return "Checked saved memories and wrote the answer"
    case "knowledge":
      return /extraction/i.test(step.action) ? "Looked for names and links to add to the graph" : "Saved the memory"
    case "execution":
      return "Planned the next step"
    case "repo_analysis":
      return "Scanned the workspace folder"
    case "tool_call":
      return `Ran ${step.action.replace(/^Tool:\s*/, "")}`
    default:
      return step.action
  }
}

/** Why a memory was picked. */
export function matchLabel(match: MemoryMatch): string {
  switch (match) {
    case "keyword":
      return "matched your words"
    case "vector":
      return "similar in meaning"
    case "hybrid_rrf":
      return "matched words and meaning"
    case "recent":
      return "one of your latest"
  }
}

/** "0.4 s", "12 s", "1 min 5 s". */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return ""
  if (ms < 950) return `${(Math.max(ms, 50) / 1000).toFixed(1)} s`
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds} s`
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`
}
