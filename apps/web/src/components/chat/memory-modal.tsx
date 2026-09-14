"use client"

import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { BrainCircuit, X, Trash2, Loader2 } from "lucide-react"
import { Button } from "../ui/button"
import { useActiveWorkspace } from "@/hooks/use-active-workspace"

interface MemoryItem {
  id: string
  content: string
  source?: string
}

export function MemoryModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { workspace, workspaceId } = useActiveWorkspace()
  const [memories, setMemories] = React.useState<MemoryItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

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
    if (open) {
      loadMemories()
    }
  }, [open, loadMemories])

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/memory/${encodeURIComponent(id)}`, { method: "DELETE" })
    if (res.ok) setMemories((prev) => prev.filter((m) => m.id !== id))
    else setError("Failed to delete memory.")
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="glass-panel w-full max-w-lg overflow-hidden rounded-xl border border-[var(--brand-color)]/30 shadow-[0_0_40px_rgba(224,108,117,0.15)] relative z-10 flex flex-col max-h-[80vh]"
          >
            <div className="flex items-center justify-between border-b border-border/50 px-4 py-3 bg-[var(--brand-color)]/5">
              <div className="flex items-center gap-2 text-[var(--brand-color)]">
                <BrainCircuit className="h-5 w-5" />
                <h2 className="font-semibold tracking-tight">Agent Memory</h2>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full" onClick={() => onOpenChange(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              {error && <div className="text-xs text-red-400">{error}</div>}
              {loading && memories.length === 0 ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : memories.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-8">
                  No memories in this workspace yet. Tell Torvaix something to remember in chat.
                </div>
              ) : (
                memories.map((m) => (
                  <motion.div
                    layout
                    key={m.id}
                    className="group flex gap-3 rounded-lg border border-border/50 bg-background/40 p-3 text-sm hover:border-[var(--brand-color)]/50 transition-colors"
                  >
                    <div className="flex-1 text-foreground/90 leading-relaxed font-mono text-xs">
                      {m.content}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete memory"
                      className="h-6 w-6 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:text-destructive"
                      onClick={() => handleDelete(m.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </motion.div>
                ))
              )}
            </div>

            <div className="border-t border-border/50 p-3 bg-background/40 text-xs text-muted-foreground flex justify-between items-center font-mono">
              <span className="truncate">{workspace?.name}</span>
              <span className="text-[var(--brand-color)]">{memories.length} stored</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
