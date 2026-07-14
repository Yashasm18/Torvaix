"use client"

import * as React from "react"
import { motion } from "framer-motion"
import {
  Bot,
  BrainCircuit,
  ChevronDown,
  Database,
  GitBranch,
  Network,
  Sparkles,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useMemoryContextStore } from "@/store/memory-context-store"

type PulseSectionProps = {
  title: string
  icon: React.ElementType
  count?: number
  children: React.ReactNode
  defaultOpen?: boolean
}

function PulseSection({ title, icon: Icon, count, children, defaultOpen = true }: PulseSectionProps) {
  const [open, setOpen] = React.useState(defaultOpen)

  return (
    <div className="rounded-lg border border-primary/10 bg-black/20 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-primary/5 transition-colors"
      >
        <span className="flex items-center gap-2 min-w-0">
          <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="font-mono text-[11px] uppercase tracking-wider text-foreground/80 truncate">
            {title}
          </span>
          {typeof count === "number" && (
            <span className="rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary">
              {count}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="border-t border-primary/10 px-3 py-3"
        >
          {children}
        </motion.div>
      )}
    </div>
  )
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <div className="font-mono text-xs text-muted-foreground italic">{children}</div>
}

export function KnowledgePulse({ compact = false }: { compact?: boolean }) {
  const {
    retrievedMemories,
    detectedEntities,
    relationships,
    graphActivity,
    agentSteps,
    averageConfidence,
    lastUpdatedAt,
  } = useMemoryContextStore()

  const hasActivity =
    retrievedMemories.length > 0 ||
    detectedEntities.length > 0 ||
    relationships.length > 0 ||
    graphActivity.updated ||
    agentSteps.length > 0

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={cn(
        "rounded-xl border border-primary/15 bg-[#050807]/80 shadow-[0_0_30px_rgba(0,212,170,0.08)]",
        "text-foreground backdrop-blur-sm",
        compact ? "p-3" : "p-4"
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-md border border-primary/20 bg-primary/10">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
              Knowledge Pulse
            </h3>
            <p className="truncate text-[11px] text-muted-foreground">
              {hasActivity
                ? "Latest memory, entity, graph, and agent activity"
                : "Waiting for the next knowledge event"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          {lastUpdatedAt ? lastUpdatedAt.toLocaleTimeString() : "idle"}
        </div>
      </div>

      <div className="space-y-2">
        <PulseSection title="Memories Retrieved" icon={Database} count={retrievedMemories.length}>
          {retrievedMemories.length === 0 ? (
            <EmptyLine>No memories retrieved for this turn.</EmptyLine>
          ) : (
            <div className="space-y-2">
              {retrievedMemories.map((memory) => (
                <div key={memory.id} className="grid grid-cols-[1fr_auto] gap-3 font-mono text-xs">
                  <div className="min-w-0">
                    <div className="truncate text-foreground/90">{memory.content}</div>
                    <div className="truncate text-[10px] text-muted-foreground">{memory.source}</div>
                  </div>
                  <div className="text-primary">{Math.round(memory.score * 100)}%</div>
                </div>
              ))}
              {averageConfidence > 0 && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/10">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${averageConfidence}%` }} />
                </div>
              )}
            </div>
          )}
        </PulseSection>

        <PulseSection title="Entities Found" icon={BrainCircuit} count={detectedEntities.length}>
          {detectedEntities.length === 0 ? (
            <EmptyLine>No entities detected yet.</EmptyLine>
          ) : (
            <div className="flex flex-wrap gap-2">
              {detectedEntities.map((entity) => (
                <span
                  key={`${entity.text}-${entity.type}`}
                  className="rounded-md border border-primary/15 bg-primary/5 px-2 py-1 font-mono text-[11px] text-foreground/85"
                >
                  {entity.text} <span className="text-primary/80">({entity.type})</span>
                </span>
              ))}
            </div>
          )}
        </PulseSection>

        <PulseSection title="Relationships Discovered" icon={GitBranch} count={relationships.length}>
          {relationships.length === 0 ? (
            <EmptyLine>No relationships discovered yet.</EmptyLine>
          ) : (
            <div className="space-y-2">
              {relationships.map((relationship) => (
                <div
                  key={`${relationship.source}-${relationship.relation}-${relationship.target}`}
                  className="rounded-md border border-border/60 bg-background/50 px-2 py-2 font-mono text-[11px]"
                >
                  <span className="text-foreground">{relationship.source}</span>
                  <span className="mx-2 text-primary">-&gt;</span>
                  <span className="text-primary/90">{relationship.relation.toUpperCase()}</span>
                  <span className="mx-2 text-primary">-&gt;</span>
                  <span className="text-foreground">{relationship.target}</span>
                </div>
              ))}
            </div>
          )}
        </PulseSection>

        <PulseSection title="Graph Activity" icon={Network} count={graphActivity.nodesAdded + graphActivity.relationshipsAdded}>
          {graphActivity.updated ? (
            <div className="grid grid-cols-2 gap-2 font-mono">
              <div className="rounded-md border border-primary/10 bg-primary/5 p-2">
                <div className="text-lg text-primary">+{graphActivity.nodesAdded}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Nodes</div>
              </div>
              <div className="rounded-md border border-primary/10 bg-primary/5 p-2">
                <div className="text-lg text-primary">+{graphActivity.relationshipsAdded}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Relationships</div>
              </div>
            </div>
          ) : (
            <EmptyLine>Knowledge graph has not updated in this turn.</EmptyLine>
          )}
        </PulseSection>

        <PulseSection title="Reasoning Path" icon={Bot} count={agentSteps.length} defaultOpen={false}>
          {agentSteps.length === 0 ? (
            <EmptyLine>No agent tool path recorded yet.</EmptyLine>
          ) : (
            <div className="space-y-2 font-mono text-xs">
              {agentSteps.map((step, index) => (
                <div key={`${step}-${index}`} className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded border border-primary/20 bg-primary/5 text-[10px] text-primary">
                    {index + 1}
                  </span>
                  <span className="text-foreground/85">{step}</span>
                </div>
              ))}
            </div>
          )}
        </PulseSection>
      </div>
    </motion.section>
  )
}
