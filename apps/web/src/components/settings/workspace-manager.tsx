"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useActiveWorkspace } from "@/hooks/use-active-workspace"
import { useDBStore } from "@/store/db-store"

/** Rename or delete the active workspace. Mount with key={workspace.id} so the draft resets. */
export function WorkspaceManager() {
  const { workspace } = useActiveWorkspace()
  const workspaceCount = useDBStore((s) => s.workspaces.length)
  const renameWorkspace = useDBStore((s) => s.renameWorkspace)
  const deleteWorkspace = useDBStore((s) => s.deleteWorkspace)
  const [draft, setDraft] = React.useState(workspace?.name ?? "")

  if (!workspace) return null

  const trimmed = draft.trim()
  const canRename = trimmed.length > 0 && trimmed !== workspace.name
  const isOnlyWorkspace = workspaceCount <= 1

  const remove = () => {
    const confirmed = window.confirm(
      `Delete workspace "${workspace.name}"?\n\nIts chats, notes and projects in this browser will be removed. ` +
        `Memories and automations on the agent server are kept.`
    )
    if (confirmed) deleteWorkspace(workspace.id)
  }

  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <div className="text-sm">Workspace</div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (canRename) renameWorkspace(workspace.id, trimmed)
        }}
      >
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={60} aria-label="Workspace name" />
        <Button type="submit" variant="secondary" size="sm" disabled={!canRename}>
          Rename
        </Button>
      </form>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {isOnlyWorkspace
            ? "This is your only workspace, so it can't be deleted."
            : "Deleting removes this workspace's chats, notes and projects from this browser."}
        </p>
        <Button type="button" variant="destructive" size="sm" disabled={isOnlyWorkspace} onClick={remove}>
          Delete
        </Button>
      </div>
    </div>
  )
}
