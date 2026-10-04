"use client"

import * as React from "react"
import { ArrowLeft, Check, Clock, Loader2, Pencil, Sparkles, Trash2, Undo2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { NO_RESPONSE, responseError } from "@/lib/api-error"
import { formatRelativeTime } from "@/lib/relative-time"
import { parseServerTimestamp } from "@/lib/server-time"
import {
  describeStep,
  formatDuration,
  matchLabel,
  summarizeTurn,
  type AnswerTurn,
  type TurnMemory,
} from "@/lib/answer-details"
import { selectShownTurn, useAnswerDetailsStore } from "@/store/answer-details-store"

async function memoryRequest(id: string, init: RequestInit): Promise<string | null> {
  try {
    const res = await fetch(`/api/memory/${encodeURIComponent(id)}`, init)
    return res.ok ? null : await responseError(res)
  } catch {
    return NO_RESPONSE
  }
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {title}
        {typeof count === "number" && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-foreground/70">{count}</span>}
      </h4>
      {children}
    </section>
  )
}

/** A memory the answer used, which can be corrected or deleted on the spot. */
function MemoryCard({ memory }: { memory: TurnMemory }) {
  const updateMemory = useAnswerDetailsStore((s) => s.updateMemory)
  const removeMemory = useAnswerDetailsStore((s) => s.removeMemory)
  const [mode, setMode] = React.useState<"view" | "edit" | "confirm-forget">("view")
  const [draft, setDraft] = React.useState(memory.content)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const savedAt = parseServerTimestamp(memory.createdAt)

  const save = async () => {
    const content = draft.trim()
    if (!content || content === memory.content) {
      setMode("view")
      return
    }
    setBusy(true)
    const failure = await memoryRequest(memory.id, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    })
    setBusy(false)
    setError(failure)
    if (!failure) {
      updateMemory(memory.id, content)
      setMode("view")
    }
  }

  const forget = async () => {
    setBusy(true)
    const failure = await memoryRequest(memory.id, { method: "DELETE" })
    setBusy(false)
    setError(failure)
    if (failure) setMode("view")
    else removeMemory(memory.id)
  }

  return (
    <li className="rounded-lg border border-border bg-background/60 p-3 space-y-2">
      {mode === "edit" ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Memory text"
          rows={3}
          className="w-full resize-y rounded-md border border-border bg-background p-2 text-sm outline-none focus:ring-1 focus:ring-primary"
          autoFocus
        />
      ) : (
        <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">{memory.content}</p>
      )}

      <p className="text-[11px] text-muted-foreground">
        {[savedAt ? `Saved ${formatRelativeTime(savedAt)}` : null, memory.source || null, matchLabel(memory.match)]
          .filter(Boolean)
          .join(" · ")}
        {memory.match !== "recent" && ` · ${Math.round(memory.score * 100)}% match`}
      </p>

      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}

      {mode === "view" && (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs text-muted-foreground" onClick={() => { setDraft(memory.content); setError(null); setMode("edit") }}>
            <Pencil className="h-3 w-3" /> Edit
          </Button>
          <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-red-400" onClick={() => { setError(null); setMode("confirm-forget") }}>
            <Trash2 className="h-3 w-3" /> Forget
          </Button>
        </div>
      )}
      {mode === "edit" && (
        <div className="flex gap-1">
          <Button size="sm" className="h-7 gap-1.5 px-2 text-xs" disabled={busy || !draft.trim()} onClick={save}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save
          </Button>
          <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs" disabled={busy} onClick={() => setMode("view")}>
            <X className="h-3 w-3" /> Cancel
          </Button>
        </div>
      )}
      {mode === "confirm-forget" && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-xs text-muted-foreground mr-1">Delete this memory for good?</span>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-400 hover:text-red-300" disabled={busy} onClick={forget}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Delete"}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy} onClick={() => setMode("view")}>
            Keep
          </Button>
        </div>
      )}
    </li>
  )
}

/** The memory a "remember that…" message stored, with a way to take it back. */
function SavedMemory({ saved }: { saved: NonNullable<AnswerTurn["savedMemory"]> }) {
  const removeMemory = useAnswerDetailsStore((s) => s.removeMemory)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const undo = async () => {
    setBusy(true)
    const failure = await memoryRequest(saved.id, { method: "DELETE" })
    setBusy(false)
    setError(failure)
    if (!failure) removeMemory(saved.id)
  }

  return (
    <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 space-y-2">
      <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">{saved.content}</p>
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
      <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs text-muted-foreground" disabled={busy} onClick={undo}>
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />} Undo
      </Button>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="space-y-3 text-sm text-muted-foreground">
      <p>After each reply, this panel shows what the answer was based on: the memories that were used, anything that was saved, and the steps taken.</p>
      <p>You can correct or delete a memory right here if it&apos;s wrong.</p>
      <div className="rounded-lg border border-border bg-background/60 p-3 space-y-1.5">
        <p className="text-xs font-medium text-foreground/80">Try it</p>
        <p className="text-xs">1. Send <span className="text-foreground">Remember that my favorite framework is Next.js</span></p>
        <p className="text-xs">2. Then ask <span className="text-foreground">What is my favorite framework?</span></p>
      </div>
    </div>
  )
}

/** "How I answered": what the agent used and did for a chat reply. */
export function AnswerDetails({ compact = false }: { compact?: boolean }) {
  const turn = useAnswerDetailsStore(selectShownTurn)
  const showingEarlier = useAnswerDetailsStore((s) => !!s.selectedMessageId && !!s.byMessage[s.selectedMessageId] && s.byMessage[s.selectedMessageId] !== s.latest)
  const select = useAnswerDetailsStore((s) => s.select)

  return (
    <div className={cn("flex flex-col gap-5 text-foreground", compact ? "p-1" : "p-2")}>
      <header className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/10">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">How I answered</h3>
          <p className="text-xs text-muted-foreground">
            {turn ? (showingEarlier ? "An earlier reply" : "The latest reply") : "Nothing to show yet"}
          </p>
        </div>
      </header>

      {showingEarlier && (
        <Button size="sm" variant="secondary" className="h-7 gap-1.5 self-start px-2 text-xs" onClick={() => select(null)}>
          <ArrowLeft className="h-3 w-3" /> Back to the latest reply
        </Button>
      )}

      {!turn ? (
        <EmptyState />
      ) : (
        <>
          <p className="rounded-lg border border-border bg-surface px-3 py-2.5 text-sm">{summarizeTurn(turn)}</p>

          {turn.savedMemory && (
            <Section title="Saved from this message">
              <SavedMemory key={turn.savedMemory.id} saved={turn.savedMemory} />
            </Section>
          )}

          {turn.retrievedMemories.length > 0 && (
            <Section title="Memories used" count={turn.retrievedMemories.length}>
              <ul className="space-y-2">
                {turn.retrievedMemories.map((memory) => (
                  <MemoryCard key={memory.id} memory={memory} />
                ))}
              </ul>
            </Section>
          )}

          {turn.entities.length + turn.relationships.length > 0 && (
            <Section title="Added to the knowledge graph" count={turn.entities.length + turn.relationships.length}>
              <div className="flex flex-wrap gap-1.5">
                {turn.entities.map((entity) => (
                  <span key={`${entity.text}-${entity.type}`} className="rounded-md border border-border bg-background/60 px-2 py-1 text-xs">
                    {entity.text}
                    {entity.type && <span className="text-muted-foreground"> · {entity.type.toLowerCase()}</span>}
                  </span>
                ))}
              </div>
              {turn.relationships.length > 0 && (
                <ul className="space-y-1 text-xs text-foreground/85">
                  {turn.relationships.map((link) => (
                    <li key={`${link.source}-${link.relation}-${link.target}`}>
                      {link.source} <span className="text-muted-foreground">{link.relation.toLowerCase().replace(/_/g, " ")}</span> {link.target}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}

          {turn.steps.length > 0 && (
            <Section title="Steps">
              <ol className="space-y-1.5">
                {turn.steps.map((step, index) => (
                  <li key={index} className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="min-w-0 text-foreground/85">{describeStep(step)}</span>
                    {step.durationMs !== undefined && <span className="shrink-0 tabular-nums text-muted-foreground">{formatDuration(step.durationMs)}</span>}
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {(turn.model || turn.totalMs > 0) && (
            <p className="flex items-center gap-1.5 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              {[turn.totalMs > 0 ? `${formatDuration(turn.totalMs)} in total` : null, turn.model].filter(Boolean).join(" · ")}
            </p>
          )}
        </>
      )}
    </div>
  )
}
