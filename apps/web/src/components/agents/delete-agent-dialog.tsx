"use client"

import { useState } from "react"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { NO_RESPONSE, responseError } from "@/lib/api-error"
import type { Agent } from "@/lib/agents"

/** Asks before an agent is deleted, in the page rather than a browser pop-up. */
export function DeleteAgentDialog({
  open,
  agent,
  onOpenChange,
  onDeleted,
}: {
  open: boolean
  agent: Agent | null
  onOpenChange: (open: boolean) => void
  onDeleted: (agentId: string) => void
}) {
  const [deleting, setDeleting] = useState(false)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Keep the dialog up until the delete has finished, so its result isn't lost.
        if (!next && deleting) return
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        {agent && (
          <DeleteBody
            key={agent.id}
            agent={agent}
            deleting={deleting}
            setDeleting={setDeleting}
            onCancel={() => onOpenChange(false)}
            onDeleted={onDeleted}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function DeleteBody({
  agent,
  deleting,
  setDeleting,
  onCancel,
  onDeleted,
}: {
  agent: Agent
  deleting: boolean
  setDeleting: (deleting: boolean) => void
  onCancel: () => void
  onDeleted: (agentId: string) => void
}) {
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async () => {
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}`, { method: "DELETE" })
      if (!res.ok) {
        setError(`Couldn't delete the agent. ${await responseError(res)}`)
        return
      }
      // A reply of success: false means it was already gone; the list reloads either way.
      onDeleted(agent.id)
    } catch {
      setError(NO_RESPONSE)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-foreground flex items-center gap-2 break-words">
          <Trash2 className="w-5 h-5 text-red-400 shrink-0" aria-hidden="true" />
          Delete this agent?
        </DialogTitle>
        <DialogDescription className="text-muted-foreground">
          <span className="font-medium text-foreground break-words">{agent.name}</span> and its run history will be
          deleted. Automations that use it will stop working until you choose another agent. This can&apos;t be undone.
        </DialogDescription>
      </DialogHeader>
      {error && (
        <p role="alert" className="text-xs text-red-400 break-words">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={deleting}>
          Cancel
        </Button>
        <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
          {deleting ? "Deleting…" : "Delete agent"}
        </Button>
      </div>
    </>
  )
}
