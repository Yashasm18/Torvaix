/**
 * Custom agents: the shapes the agent server returns from /api/agents, shared by the Agents
 * page, the chat's agent picker and the Automations page.
 */

import { responseError } from "@/lib/api-error"

/** A tool an agent can be allowed to use. Tools that need approval ask before every run. */
export interface AgentToolInfo {
  id: string
  label: string
  description: string
  needsApproval: boolean
}

/** An agent the user set up: its own instructions and the tools it may use. */
export interface Agent {
  id: string
  workspaceId: string
  name: string
  description: string
  instructions: string
  /** Ids of the tools it may use, from `availableTools`. */
  tools: string[]
  createdAt: string
  updatedAt: string
  runCount: number
  lastRunAt: string | null
}

/** "cancelled" means the user denied the command the run was waiting on, or stopped the run. */
export type AgentRunStatus = "completed" | "awaiting_approval" | "error" | "cancelled"

/** One run of an agent on a task. */
export interface AgentRun {
  id: string
  agentId: string
  workspaceId: string
  task: string
  status: AgentRunStatus
  output: string
  /** Set while the run waits for the user to approve a shell or Python command. */
  pendingActionId: string | null
  durationMs: number
  createdAt: string
}

export interface AgentsResponse {
  success: true
  agents: Agent[]
  availableTools: AgentToolInfo[]
}

/** Loads a workspace's agents and the tools they can be given. Throws with a readable message. */
export async function fetchAgents(workspaceId: string, signal?: AbortSignal): Promise<AgentsResponse> {
  const res = await fetch(`/api/agents?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store", signal })
  if (!res.ok) throw new Error(await responseError(res))
  return res.json()
}
