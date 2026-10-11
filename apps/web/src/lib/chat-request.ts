/** Marks the chat message that carries an approval or a denial back to the agent. */
export const DECISION_MARKER = "__PENDING_ACTION_ID__"

/** Longest single message the agent server accepts (LIMITS.instructionsChars there). */
export const MAX_MESSAGE_CHARS = 150_000
/** How much of an earlier command's output is passed back to the model. */
const MAX_TOOL_OUTPUT_CHARS = 6_000
const MAX_HISTORY_ENTRIES = 100

interface ChatMessageLike {
  role?: unknown
  content?: unknown
  toolInvocations?: unknown
}

export interface AgentRequest {
  /** What the agent is asked to do. */
  instructions: string
  /** The approval being resumed, when the last message carries one. */
  pendingActionId?: string
  /** Earlier turns, including the results of commands that already ran. */
  history: { role: "user" | "assistant" | "system"; content: string }[]
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}\n[... cut off]` : text)
const carriesDecision = (m: ChatMessageLike | null | undefined) => typeof m?.content === "string" && m.content.includes(DECISION_MARKER)
const isRole = (role: unknown): role is "user" | "assistant" | "system" => role === "user" || role === "assistant" || role === "system"

/**
 * Turns the chat's messages into what the agent server is asked to do.
 *
 * - When the last message carries an approval, the task is still what the user asked for.
 *   Sending "I have approved the action." as the task made the model act on that sentence.
 * - The results of commands that already ran are part of the history. They live only on the
 *   browser's messages, and without them a task needing two approvals forgot the first result
 *   and asked to run the first command again.
 * - Nothing in the history is longer than the server accepts, so one oversized old message
 *   can't make every later message fail.
 */
export function toAgentRequest(messages: unknown): AgentRequest | null {
  const all: ChatMessageLike[] = Array.isArray(messages) ? messages : []
  const last = all[all.length - 1]
  if (!last || typeof last.content !== "string") return null
  const earlier = all.slice(0, -1)

  let instructions = last.content
  let pendingActionId: string | undefined
  const decision = instructions.match(/__PENDING_ACTION_ID__:([a-f0-9-]+)/)
  if (decision) {
    pendingActionId = decision[1]
    const request = [...earlier].reverse().find((m) => m?.role === "user" && typeof m.content === "string" && !carriesDecision(m))
    instructions =
      typeof request?.content === "string" ? request.content : instructions.replace(/__PENDING_ACTION_ID__:([a-f0-9-]+)/, "").trim()
  }

  const history: AgentRequest["history"] = []
  for (const m of earlier) {
    if (!m || !isRole(m.role) || typeof m.content !== "string" || carriesDecision(m)) continue
    if (m.role === "assistant" && Array.isArray(m.toolInvocations)) {
      for (const tool of m.toolInvocations as { state?: unknown; toolName?: unknown; result?: { output?: unknown } }[]) {
        const output = tool?.state === "result" ? tool.result?.output : undefined
        if (typeof tool?.toolName === "string" && typeof output === "string") {
          history.push({ role: "system", content: `Tool ${tool.toolName} Result: ${clip(output, MAX_TOOL_OUTPUT_CHARS)}` })
        }
      }
    }
    if (m.content.trim()) history.push({ role: m.role, content: clip(m.content, MAX_MESSAGE_CHARS - 100) })
  }

  return { instructions, ...(pendingActionId ? { pendingActionId } : {}), history: history.slice(-MAX_HISTORY_ENTRIES) }
}
