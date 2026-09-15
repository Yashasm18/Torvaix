"use client"

import * as React from "react"
import type { WorkspaceTemplate } from "@torvaix/types"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useDBStore } from "@/store/db-store"

const TEMPLATES: { id: WorkspaceTemplate; label: string; hint: string }[] = [
  { id: "general", label: "General", hint: "An empty workspace with one chat" },
  { id: "coding", label: "Coding", hint: "Code assistant chat and a snippets note" },
  { id: "university", label: "University", hint: "Discussion chat plus assignments and references notes" },
  { id: "research", label: "Research", hint: "An empty workspace for research" },
  { id: "startup", label: "Startup", hint: "An empty workspace for your company" },
]

export function CreateWorkspaceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const createWorkspace = useDBStore((s) => s.createWorkspace)
  const [name, setName] = React.useState("")
  const [template, setTemplate] = React.useState<WorkspaceTemplate>("general")
  const [creating, setCreating] = React.useState(false)

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setName("")
      setTemplate("general")
    }
    onOpenChange(next)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setCreating(true)
    try {
      await createWorkspace(trimmed, template)
      onOpenChange(false)
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md bg-card border-border">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Create workspace</DialogTitle>
            <DialogDescription>
              Each workspace keeps its own chats, memories, projects and automations.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="workspace-name">Name</Label>
            <Input
              id="workspace-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Thesis, Side project"
              maxLength={60}
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="workspace-template">Template</Label>
            <select
              id="workspace-template"
              value={template}
              onChange={(e) => setTemplate(e.target.value as WorkspaceTemplate)}
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">{TEMPLATES.find((t) => t.id === template)?.hint}</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || creating}>
              {creating ? "Creating…" : "Create workspace"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
