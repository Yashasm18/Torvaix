"use client"

import * as React from "react"
import Link from "next/link"
import { BrainCircuit, Trash2, Loader2, Search, ArrowRight } from "lucide-react"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog"
import { useActiveWorkspace } from "@/hooks/use-active-workspace"
import { formatRelativeTime } from "@/lib/relative-time"

interface MemoryItem {
  id: string
  content: string
  source?: string
  createdAt?: string
}

/**
 * What Torvaix remembers in this workspace, from the chat's message box. Built on the shared
 * dialog, so Escape closes it, focus stays inside it and screen readers announce it.
 */
export function MemoryModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { workspace, workspaceId } = useActiveWorkspace()
  const [memories, setMemories] = React.useState<MemoryItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [filter, setFilter] = React.useState("")
  const [confirmId, setConfirmId] = React.useState<string | null>(null)

  const loadMemories = React.useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/memory?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setMemories(Array.isArray(data.memories) ? data.memories : [])
      setError(null)
    } catch {
      setError("Couldn't reach the agent server.")
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  React.useEffect(() => {
    if (!open) return
    setFilter("")
    setConfirmId(null)
    loadMemories()
  }, [open, loadMemories])

  const handleDelete = async (id: string) => {
    setConfirmId(null)
    const res = await fetch(`/api/memory/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null)
    if (res?.ok) setMemories((prev) => prev.filter((m) => m.id !== id))
    else setError("Couldn't delete that memory. Is the agent server running?")
  }

  const needle = filter.trim().toLowerCase()
  const shown = needle ? memories.filter((m) => m.content.toLowerCase().includes(needle)) : memories

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-primary" />
            What Torvaix remembers
          </DialogTitle>
          <DialogDescription>
            Memories saved in {workspace?.name ?? "this workspace"}. Torvaix uses them to answer you. Delete any that are wrong.
          </DialogDescription>
          {memories.length > 3 && (
            <div className="relative mt-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter memories…"
                aria-label="Filter memories"
                className="pl-8"
              />
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-32">
          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
          {loading && memories.length === 0 ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : memories.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              Nothing saved yet. Start a message with &ldquo;Remember that…&rdquo; and Torvaix will keep it here.
            </p>
          ) : shown.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No memories match &ldquo;{filter}&rdquo;.</p>
          ) : (
            shown.map((m) => (
              <div key={m.id} className="group flex items-start gap-3 rounded-lg border border-border bg-background/40 p-3 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="text-foreground/90 leading-relaxed break-words">{m.content}</p>
                  {(m.source || m.createdAt) && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[m.source, m.createdAt ? formatRelativeTime(m.createdAt) : null].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                {confirmId === m.id ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="destructive" className="h-7" onClick={() => handleDelete(m.id)}>
                      Delete
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => setConfirmId(null)}>
                      Keep
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete memory"
                    title="Delete memory"
                    className="h-7 w-7 shrink-0 text-muted-foreground opacity-60 group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive"
                    onClick={() => setConfirmId(m.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))
          )}
        </div>

        <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground flex justify-between items-center gap-3">
          <span>
            {memories.length} {memories.length === 1 ? "memory" : "memories"}
          </span>
          <Link
            href="/knowledge"
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center gap-1 text-primary hover:underline underline-offset-2"
          >
            Open Knowledge <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  )
}
