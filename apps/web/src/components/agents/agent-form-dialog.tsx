"use client"

import { useId, useRef, useState } from "react"
import { Bot, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { NO_RESPONSE, responseError } from "@/lib/api-error"
import type { Agent, AgentToolInfo } from "@/lib/agents"
import {
  DESCRIPTION_MAX,
  EMPTY_AGENT_FORM,
  INSTRUCTIONS_MAX,
  NAME_MAX,
  agentPayload,
  firstInvalidField,
  formFromAgent,
  toggleTool,
  validateAgentForm,
  type AgentFormField,
  type AgentFormValues,
} from "@/lib/agent-form"

const fieldClass =
  "w-full mt-1.5 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary aria-[invalid=true]:border-red-500/60 disabled:opacity-60"
const labelClass = "text-xs font-semibold uppercase tracking-wider text-muted-foreground"

/** Create an agent, or edit one: its name, what it is for, its instructions and its tools. */
export function AgentFormDialog({
  open,
  agent,
  availableTools,
  workspaceId,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  /** The agent being edited, or null to create a new one. */
  agent: Agent | null
  availableTools: AgentToolInfo[]
  workspaceId: string
  onOpenChange: (open: boolean) => void
  onSaved: (agent: Agent | null) => void
}) {
  const [saving, setSaving] = useState(false)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Keep the dialog up until the save has finished, so its result isn't lost.
        if (!next && saving) return
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <FormBody
          key={agent?.id ?? "new"}
          agent={agent}
          availableTools={availableTools}
          workspaceId={workspaceId}
          saving={saving}
          setSaving={setSaving}
          onCancel={() => onOpenChange(false)}
          onSaved={onSaved}
        />
      </DialogContent>
    </Dialog>
  )
}

function FormBody({
  agent,
  availableTools,
  workspaceId,
  saving,
  setSaving,
  onCancel,
  onSaved,
}: {
  agent: Agent | null
  availableTools: AgentToolInfo[]
  workspaceId: string
  saving: boolean
  setSaving: (saving: boolean) => void
  onCancel: () => void
  onSaved: (agent: Agent | null) => void
}) {
  const editing = agent !== null
  const [values, setValues] = useState<AgentFormValues>(() =>
    agent ? formFromAgent(agent, availableTools) : EMPTY_AGENT_FORM
  )
  // Problems are only shown once the user has tried to save, then they follow the edits.
  const [submitted, setSubmitted] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const errors = submitted ? validateAgentForm(values) : {}

  const uid = useId()
  const ids = {
    name: `${uid}-name`,
    description: `${uid}-description`,
    instructions: `${uid}-instructions`,
  }
  const nameRef = useRef<HTMLInputElement>(null)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  const instructionsRef = useRef<HTMLTextAreaElement>(null)
  const fieldRefs: Record<AgentFormField, { current: HTMLInputElement | HTMLTextAreaElement | null }> = {
    name: nameRef,
    description: descriptionRef,
    instructions: instructionsRef,
  }

  const set = <K extends keyof AgentFormValues>(key: K, value: AgentFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (saving) return
    setSubmitted(true)
    setServerError(null)

    const first = firstInvalidField(validateAgentForm(values))
    if (first) {
      fieldRefs[first].current?.focus()
      return
    }

    setSaving(true)
    try {
      const payload = agentPayload(values)
      const res = await fetch(editing ? `/api/agents/${encodeURIComponent(agent.id)}` : "/api/agents", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? payload : { workspaceId, ...payload }),
      })
      if (!res.ok) {
        setServerError(await responseError(res))
        return
      }
      const data = await res.json().catch(() => null)
      onSaved(data?.agent ?? null)
      onCancel()
    } catch {
      setServerError(NO_RESPONSE)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-xl font-bold flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" aria-hidden="true" />
          {editing ? "Edit agent" : "New agent"}
        </DialogTitle>
        <DialogDescription>
          Give the agent a job, tell it how to do the job, and choose the tools it may use.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} noValidate className="space-y-4 pt-1 min-w-0">
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor={ids.name} className={labelClass}>
              Name
            </label>
            <Counter length={values.name.trim().length} max={NAME_MAX} />
          </div>
          <input
            ref={nameRef}
            id={ids.name}
            type="text"
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            disabled={saving}
            placeholder="e.g. Research helper"
            aria-required="true"
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? `${ids.name}-error` : undefined}
            className={fieldClass}
          />
          <FieldError id={`${ids.name}-error`} message={errors.name} />
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor={ids.description} className={labelClass}>
              What it is for <span className="normal-case font-normal tracking-normal">(optional)</span>
            </label>
            <Counter length={values.description.trim().length} max={DESCRIPTION_MAX} />
          </div>
          <textarea
            ref={descriptionRef}
            id={ids.description}
            rows={2}
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            disabled={saving}
            placeholder="e.g. Finds sources on a topic and summarises what they say."
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={errors.description ? `${ids.description}-error` : undefined}
            className={fieldClass}
          />
          <FieldError id={`${ids.description}-error`} message={errors.description} />
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor={ids.instructions} className={labelClass}>
              Instructions
            </label>
            <Counter length={values.instructions.trim().length} max={INSTRUCTIONS_MAX} />
          </div>
          <textarea
            ref={instructionsRef}
            id={ids.instructions}
            rows={6}
            value={values.instructions}
            onChange={(e) => set("instructions", e.target.value)}
            disabled={saving}
            placeholder={
              "Say how the agent should work. For example: You review code changes. Read the files that changed, " +
              "point out bugs and unclear names, and keep each comment short."
            }
            aria-required="true"
            aria-invalid={errors.instructions ? true : undefined}
            aria-describedby={errors.instructions ? `${ids.instructions}-error` : undefined}
            className={`${fieldClass} max-h-72 overflow-y-auto`}
          />
          <FieldError id={`${ids.instructions}-error`} message={errors.instructions} />
        </div>

        <fieldset className="min-w-0" disabled={saving} aria-describedby={`${uid}-tools-help`}>
          <legend className={labelClass}>Tools</legend>
          <p id={`${uid}-tools-help`} className="text-xs text-muted-foreground mt-1.5">
            The agent can only use the tools you tick. Tools with a shield ask for your approval before every run.
          </p>
          <div className="grid gap-2 mt-2">
            {availableTools.map((tool) => (
              <label
                key={tool.id}
                className="flex items-start gap-3 rounded-lg border border-border bg-background/50 p-3 cursor-pointer transition-colors hover:border-primary/40 has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5"
              >
                <input
                  type="checkbox"
                  checked={values.tools.includes(tool.id)}
                  onChange={() => set("tools", toggleTool(values.tools, tool.id))}
                  aria-labelledby={`${uid}-${tool.id}-label`}
                  aria-describedby={`${uid}-${tool.id}-description`}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                />
                <span className="min-w-0">
                  <span
                    id={`${uid}-${tool.id}-label`}
                    className="flex flex-wrap items-center gap-x-2 text-sm font-medium text-foreground"
                  >
                    {tool.label}
                    {tool.needsApproval && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-normal text-amber-400">
                        <Shield className="w-3 h-3" aria-hidden="true" />
                        Asks before every run
                      </span>
                    )}
                  </span>
                  <span id={`${uid}-${tool.id}-description`} className="block text-xs text-muted-foreground mt-0.5">
                    {tool.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {serverError && (
          <p role="alert" className="text-xs text-red-400 break-words">
            Couldn&apos;t save the agent. {serverError}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Create agent"}
          </Button>
        </div>
      </form>
    </>
  )
}

function Counter({ length, max }: { length: number; max: number }) {
  return (
    <span className={`text-[11px] font-mono ${length > max ? "text-red-400" : "text-muted-foreground"}`}>
      {length.toLocaleString("en-US")} / {max.toLocaleString("en-US")}
    </span>
  )
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} role="alert" className="text-xs text-red-400 mt-1.5">
      {message}
    </p>
  )
}
