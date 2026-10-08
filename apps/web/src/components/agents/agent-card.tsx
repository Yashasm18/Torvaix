"use client"

import { motion } from "framer-motion"
import { Bot, Pencil, Play, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Agent, AgentToolInfo } from "@/lib/agents"
import { lastRunLabel, runCountLabel } from "@/lib/agent-form"
import { parseServerTimestamp } from "@/lib/server-time"
import { ToolChips } from "./tool-chips"

/** One agent the user set up: what it is for, its tools, how often it ran, and what to do with it. */
export function AgentCard({
  agent,
  tools,
  index,
  onRun,
  onEdit,
  onDelete,
}: {
  agent: Agent
  tools: AgentToolInfo[]
  index: number
  onRun: (agent: Agent) => void
  onEdit: (agent: Agent) => void
  onDelete: (agent: Agent) => void
}) {
  const lastRun = parseServerTimestamp(agent.lastRunAt)

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.3), duration: 0.25 }}
      className="bg-card border border-border rounded-xl p-5 flex flex-col gap-4 min-w-0 hover:border-primary/30 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
          <Bot className="w-5 h-5" aria-hidden="true" />
        </div>
        <h3 className="font-semibold text-foreground break-words min-w-0 pt-2">{agent.name}</h3>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed break-words flex-1">
        {agent.description || "No description."}
      </p>

      <ToolChips toolIds={agent.tools} tools={tools} />

      <div className="flex flex-col gap-3 pt-3 border-t border-border/50 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground" title={lastRun?.toLocaleString()}>
          {lastRunLabel(agent.lastRunAt)} · {runCountLabel(agent.runCount)}
        </p>
        <div className="flex items-center gap-1.5">
          <Button size="sm" onClick={() => onRun(agent)} aria-label={`Run ${agent.name}`} className="gap-1.5">
            <Play className="w-3.5 h-3.5" aria-hidden="true" />
            Run
          </Button>
          <Button size="sm" variant="outline" onClick={() => onEdit(agent)} aria-label={`Edit ${agent.name}`} className="gap-1.5">
            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
            Edit
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => onDelete(agent)}
            aria-label={`Delete ${agent.name}`}
            title="Delete"
            className="text-muted-foreground hover:text-red-400"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </motion.article>
  )
}
