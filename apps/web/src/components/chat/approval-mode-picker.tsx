"use client"

import * as React from "react"
import { ShieldAlert, ShieldCheck, Zap } from "lucide-react"

import {
  APPROVAL_MODES,
  currentApprovalMode,
  saveApprovalMode,
  subscribeApprovalMode,
  type ApprovalMode,
} from "@/lib/approval-mode"

const ICONS = { ask: ShieldCheck, auto: Zap, bypass: ShieldAlert }
const SELECTED: Record<ApprovalMode, string> = {
  ask: "bg-muted text-foreground border-border",
  auto: "bg-primary/15 text-primary border-primary/40",
  bypass: "bg-red-500/15 text-red-400 border-red-500/40",
}

/** The saved approval mode; "ask" on the server and until the page has read the browser's storage. */
export function useApprovalMode(): ApprovalMode {
  return React.useSyncExternalStore(subscribeApprovalMode, currentApprovalMode, () => "ask")
}

/**
 * Chooses whether commands the assistant runs wait for approval. All three choices are always
 * on show under the message box; as a small menu next to the attach button it went unnoticed.
 */
export function ApprovalModePicker({ disabled }: { disabled?: boolean }) {
  const mode = useApprovalMode()
  const active = APPROVAL_MODES.find((m) => m.id === mode) ?? APPROVAL_MODES[0]

  const choose = (next: ApprovalMode) => {
    if (next === mode) return
    if (
      next === "bypass" &&
      !window.confirm("Bypass runs every command the assistant decides on without asking you, including ones that change or delete files. Turn it on?")
    ) {
      return
    }
    saveApprovalMode(next)
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-2">
      <div role="radiogroup" aria-label="When commands run" className="flex items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">Commands:</span>
        {APPROVAL_MODES.map((m) => {
          const Icon = ICONS[m.id]
          const selected = m.id === mode
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              title={m.description}
              onClick={() => choose(m.id)}
              className={`flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors disabled:opacity-50 ${
                selected ? SELECTED[m.id] : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {m.label}
            </button>
          )
        })}
      </div>
      <span className="min-w-0 flex-1 basis-48 text-[11px] text-muted-foreground">{active.description}</span>
    </div>
  )
}
