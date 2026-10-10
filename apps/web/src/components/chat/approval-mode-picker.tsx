"use client"

import * as React from "react"
import { Check, ChevronDown, ShieldAlert, ShieldCheck, Zap } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  APPROVAL_MODES,
  currentApprovalMode,
  saveApprovalMode,
  subscribeApprovalMode,
  type ApprovalMode,
} from "@/lib/approval-mode"

const ICONS = { ask: ShieldCheck, auto: Zap, bypass: ShieldAlert }
const TONES: Record<ApprovalMode, string> = {
  ask: "text-muted-foreground hover:text-foreground",
  auto: "text-primary",
  bypass: "text-red-400",
}

/** The saved approval mode; "ask" on the server and until the page has read the browser's storage. */
export function useApprovalMode(): ApprovalMode {
  return React.useSyncExternalStore(subscribeApprovalMode, currentApprovalMode, () => "ask")
}

/** Chooses whether commands the assistant runs wait for approval. Sits under the message box. */
export function ApprovalModePicker({ disabled }: { disabled?: boolean }) {
  const mode = useApprovalMode()
  const active = APPROVAL_MODES.find((m) => m.id === mode) ?? APPROVAL_MODES[0]
  const Icon = ICONS[mode]

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
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        aria-label={`Command approval: ${active.label}`}
        title={active.description}
        className={`flex h-8 items-center gap-1.5 rounded-md border-none bg-transparent px-2 text-xs outline-none transition-colors hover:bg-muted/60 disabled:opacity-50 cursor-pointer ${TONES[mode]}`}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{active.label}</span>
        <ChevronDown className="h-3 w-3 opacity-70" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80 bg-popover border-border">
        {APPROVAL_MODES.map((m) => {
          const ItemIcon = ICONS[m.id]
          return (
            <DropdownMenuItem key={m.id} onClick={() => choose(m.id)} className="cursor-pointer items-start gap-2.5 py-2">
              <ItemIcon className={`mt-0.5 h-4 w-4 shrink-0 ${m.id === "bypass" ? "text-red-400" : m.id === "auto" ? "text-primary" : "text-muted-foreground"}`} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-foreground">{m.label}</span>
                <span className="block text-xs leading-snug text-muted-foreground">{m.description}</span>
              </span>
              {m.id === mode && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
