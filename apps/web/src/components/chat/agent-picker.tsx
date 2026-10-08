"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Bot, Check, ChevronDown } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { fetchAgents, type Agent } from "@/lib/agents"
import { cn } from "@/lib/utils"

/** The normal assistant. It has every tool and is used when no agent is chosen. */
export const DEFAULT_AGENT_NAME = "Torvaix"

/** Stands in for an agent that was chosen earlier but can't be named while the list is unavailable. */
export const REMEMBERED_AGENT_NAME = "Your agent"

export type AgentsStatus = "loading" | "ready" | "failed"

const NO_AGENTS: Agent[] = []

/**
 * What to call whoever answers a chat. An agent that was chosen but can't be looked up yet is
 * still the one that answers, so it is never shown as the normal assistant.
 */
export function agentLabel(agents: Agent[], status: AgentsStatus, value: string | null): string {
  const chosen = agents.find((a) => a.id === value)
  if (chosen) return chosen.name
  return value && status !== "ready" ? REMEMBERED_AGENT_NAME : DEFAULT_AGENT_NAME
}

/**
 * A workspace's agents. `status` tells "not loaded yet" and "couldn't load" apart from "there
 * are none", so a caller never takes an unfinished list for proof that an agent is gone.
 */
export function useWorkspaceAgents(workspaceId: string) {
  const [result, setResult] = useState<{ workspaceId: string; agents: Agent[] | null } | null>(null)
  const [reloads, setReloads] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetchAgents(workspaceId, controller.signal)
      .then((res) => setResult({ workspaceId, agents: res.agents }))
      .catch(() => {
        if (!controller.signal.aborted) setResult({ workspaceId, agents: null })
      })
    return () => controller.abort()
  }, [workspaceId, reloads])

  // An answer for another workspace doesn't count.
  const current = result?.workspaceId === workspaceId ? result : null
  const status: AgentsStatus = !current ? "loading" : current.agents ? "ready" : "failed"
  const reload = () => {
    // After a failure, go back to "loading" so a second failure is a visible change. A list that
    // loaded stays on screen until the new one arrives.
    setResult((prev) => (prev?.agents ? prev : null))
    setReloads((n) => n + 1)
  }
  return { agents: current?.agents ?? NO_AGENTS, status, reload }
}

function Option({
  name,
  description,
  selected,
  onSelect,
}: {
  name: string
  description: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <DropdownMenuItem onClick={onSelect} className="cursor-pointer items-start justify-between gap-3 py-1.5">
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{name}</span>
        {description && <span className="line-clamp-2 block break-words text-xs text-muted-foreground">{description}</span>}
      </span>
      {selected && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />}
    </DropdownMenuItem>
  )
}

/** Chooses who answers a chat: the normal assistant or one of the workspace's agents. */
export function AgentPicker({
  agents,
  status,
  value,
  onChange,
  onRetry,
  disabled,
}: {
  agents: Agent[]
  status: AgentsStatus
  /** Id of the agent chosen for the chat, or null for the normal assistant. */
  value: string | null
  onChange: (agentId: string | null) => void
  /** Load the list of agents again after it failed to load. */
  onRetry: () => void
  disabled?: boolean
}) {
  const chosen = agents.find((a) => a.id === value)
  const label = agentLabel(agents, status, value)
  // A remembered agent that can't be found because the list isn't available is not "no agent".
  const unresolved = !!value && !chosen && status !== "ready"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Choose who answers"
        disabled={disabled}
        className={cn(
          "flex h-8 max-w-44 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs text-muted-foreground outline-none transition-colors",
          "hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted aria-expanded:text-foreground",
          "disabled:pointer-events-none disabled:opacity-50"
        )}
      >
        <Bot className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden truncate sm:inline">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-96 w-80 overflow-y-auto border-border bg-popover">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Answer with</DropdownMenuLabel>
          <Option
            name={DEFAULT_AGENT_NAME}
            description="The normal assistant, with all tools."
            selected={!chosen && !unresolved}
            onSelect={() => onChange(null)}
          />
          {agents.map((agent) => (
            <Option
              key={agent.id}
              name={agent.name}
              description={agent.description}
              selected={agent.id === chosen?.id}
              onSelect={() => onChange(agent.id)}
            />
          ))}
        </DropdownMenuGroup>
        {status === "loading" && <p className="px-1.5 py-1.5 text-xs text-muted-foreground">Loading your agents…</p>}
        {status === "failed" && (
          <>
            <p className="px-1.5 py-1.5 text-xs text-muted-foreground">Couldn&apos;t load your agents.</p>
            <DropdownMenuItem onClick={onRetry} closeOnClick={false} className="cursor-pointer text-xs">
              Try again
            </DropdownMenuItem>
          </>
        )}
        {status === "ready" && agents.length === 0 && (
          <p className="px-1.5 py-1.5 text-xs text-muted-foreground">You haven&apos;t set up any agents yet.</p>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/agents" />} className="cursor-pointer text-xs text-muted-foreground">
          Manage agents
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
