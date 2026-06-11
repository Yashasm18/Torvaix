"use client"

import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { BrainCircuit, X, Trash2 } from "lucide-react"
import { getMemories, removeMemory, MemoryItem } from "@/lib/local-vector-db"
import { Button } from "../ui/button"

export function MemoryModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [memories, setMemories] = React.useState<MemoryItem[]>([])

  React.useEffect(() => {
    if (open) {
      loadMemories()
    }
  }, [open])

  const loadMemories = async () => {
    const data = await getMemories()
    setMemories(data)
  }

  const handleDelete = async (id: string) => {
    await removeMemory(id)
    await loadMemories()
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
              {memories.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-8">
                  <div className="text-xs font-mono opacity-50 mb-2">{"< EMPTY_BUFFER />"}</div>
                  No core memories established yet.
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
              <span>LOCAL_STORE: IDB_KEYVAL</span>
              <span className="text-[var(--brand-color)]">OFFLINE_READY</span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
