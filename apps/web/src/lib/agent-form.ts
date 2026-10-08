/**
 * Pure helpers for the Agents page: the form's limits and validation, tool selection, and the
 * short texts shown for a run. No React or fetch here, so each one can be tested on its own.
 */

import type { Agent, AgentRunStatus, AgentToolInfo } from "./agents"
import { formatRelativeTime } from "./relative-time"
import { parseServerTimestamp } from "./server-time"

// These match the limits the agent server enforces, so the form can say what is wrong before
// the user waits for a rejection.
export const NAME_MAX = 80
export const DESCRIPTION_MAX = 300
export const INSTRUCTIONS_MAX = 4000
export const TASK_MAX = 150_000

export interface AgentFormValues {
  name: string
  description: string
  instructions: string
  tools: string[]
}

export type AgentFormField = "name" | "description" | "instructions"
export type AgentFormErrors = Partial<Record<AgentFormField, string>>

/** The order the form is read in, so the first problem found is the first one on screen. */
export const FORM_FIELD_ORDER: AgentFormField[] = ["name", "description", "instructions"]

export const EMPTY_AGENT_FORM: AgentFormValues = { name: "", description: "", instructions: "", tools: [] }

/**
 * Form values for editing an agent. Tool ids the server no longer offers are dropped: they have
 * no checkbox to untick, and sending one back would make the save fail.
 */
export function formFromAgent(agent: Agent, availableTools: AgentToolInfo[]): AgentFormValues {
  const known = new Set(availableTools.map((tool) => tool.id))
  return {
    name: agent.name,
    description: agent.description,
    instructions: agent.instructions,
    tools: agent.tools.filter((id) => known.has(id)),
  }
}

/** Problems with the form, keyed by field. An empty object means it can be saved. */
export function validateAgentForm(values: AgentFormValues): AgentFormErrors {
  const errors: AgentFormErrors = {}
  const name = values.name.trim().length
  const description = values.description.trim().length
  const instructions = values.instructions.trim().length

  if (name === 0) errors.name = "Enter a name for the agent."
  else if (name > NAME_MAX) errors.name = `The name can be up to ${NAME_MAX} characters. It is ${name} now.`

  if (description > DESCRIPTION_MAX) {
    errors.description = `The description can be up to ${DESCRIPTION_MAX} characters. It is ${description} now.`
  }

  if (instructions === 0) errors.instructions = "Enter instructions for the agent."
  else if (instructions > INSTRUCTIONS_MAX) {
    errors.instructions = `The instructions can be up to ${INSTRUCTIONS_MAX.toLocaleString("en-US")} characters. They are ${instructions.toLocaleString("en-US")} now.`
  }

  return errors
}

/** The first field with a problem, in on-screen order, or null when the form is fine. */
export function firstInvalidField(errors: AgentFormErrors): AgentFormField | null {
  return FORM_FIELD_ORDER.find((field) => errors[field]) ?? null
}

/** The body sent to the server: text trimmed, each tool listed once. */
export function agentPayload(values: AgentFormValues) {
  return {
    name: values.name.trim(),
    description: values.description.trim(),
    instructions: values.instructions.trim(),
    tools: [...new Set(values.tools)],
  }
}

/** Adds the tool if it is not in the list and removes it if it is. Returns a new list. */
export function toggleTool(tools: string[], toolId: string): string[] {
  return tools.includes(toolId) ? tools.filter((id) => id !== toolId) : [...tools, toolId]
}

/** The message to show for a task that cannot be sent, or null when it can. */
export function validateTask(task: string): string | null {
  const length = task.trim().length
  if (length === 0) return "Enter a task for the agent."
  if (length > TASK_MAX) {
    return `The task can be up to ${TASK_MAX.toLocaleString("en-US")} characters. It is ${length.toLocaleString("en-US")} now.`
  }
  return null
}

/** A short label for a run's status. */
export function runStatusLabel(status: AgentRunStatus): string {
  switch (status) {
    case "completed":
      return "Done"
    case "awaiting_approval":
      return "Waiting for approval"
    case "error":
      return "Failed"
    case "cancelled":
      return "Stopped"
    default:
      // The server could add a status this page does not know yet; show it rather than nothing.
      return String(status)
  }
}

/** What the agent server says when a run is resumed while its command has not been decided yet. */
export const COMMAND_UNDECIDED_MESSAGE = "Approve or deny the command first"

/**
 * True for that reply, and only that one: a run that is "already in progress" is a 409 too, but
 * it has no command to show.
 */
export function isCommandUndecided(status: number | undefined, message: string): boolean {
  return status === 409 && message.startsWith(COMMAND_UNDECIDED_MESSAGE)
}

/** "420 ms", "2.4 s", "45 s", "3 min 5 s". A dash for a missing or negative value. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—"
  if (Math.round(ms) < 1000) return `${Math.round(ms)} ms`
  const tenths = Math.round(ms / 100)
  if (tenths < 100) return `${(tenths / 10).toFixed(1)} s`
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds} s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`
}

/** "No runs", "1 run", "5 runs". */
export function runCountLabel(count: number): string {
  if (!count || count < 1) return "No runs"
  return count === 1 ? "1 run" : `${count} runs`
}

/** When an agent last ran, for its card: "Never run" or "Last run 5 minutes ago". */
export function lastRunLabel(lastRunAt: string | null, now: number = Date.now()): string {
  const date = parseServerTimestamp(lastRunAt)
  return date ? `Last run ${formatRelativeTime(date, now)}` : "Never run"
}

/** Ids of the agent's tools that ask for approval before every run, in the agent's order. */
export function approvalToolIds(toolIds: string[], availableTools: AgentToolInfo[]): string[] {
  const needing = new Set(availableTools.filter((tool) => tool.needsApproval).map((tool) => tool.id))
  return toolIds.filter((id) => needing.has(id))
}
