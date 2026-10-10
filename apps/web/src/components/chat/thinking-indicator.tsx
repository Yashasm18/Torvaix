"use client"

import * as React from "react"

import type { ProgressStep } from "@/lib/progress"

// Braille frames: the same spinner terminal tools use.
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
const WORDS = [
  "Thinking",
  "Connecting the dots",
  "Crunching tokens",
  "Consulting memory",
  "Reasoning it through",
  "Traversing the graph",
  "Compiling thoughts",
  "Reticulating splines",
]

/**
 * Shown while a reply is being worked out: a terminal-style spinner, a phrase that changes, how
 * long it has taken, and under it the steps the agent reports as it goes (what it is doing and,
 * when the model says so, why).
 */
export function ThinkingIndicator({ steps }: { steps: ProgressStep[] }) {
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 90)
    return () => clearInterval(timer)
  }, [])

  const seconds = Math.floor((tick * 90) / 1000)
  const word = WORDS[Math.floor(tick / 28) % WORDS.length]
  const shown = steps.slice(-6)

  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2 font-mono text-sm">
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="w-4 text-center text-base leading-none text-primary">{FRAMES[tick % FRAMES.length]}</span>
        <span className="text-primary">{word}…</span>
        {seconds >= 2 && <span className="text-xs text-muted-foreground">{seconds}s</span>}
      </div>
      {shown.length > 0 && (
        <ol className="flex flex-col gap-1 border-l border-border pl-3 text-xs">
          {shown.map((step, i) => {
            const current = i === shown.length - 1
            return (
              <li key={`${i}-${step.label}`} className={current ? "text-foreground" : "text-muted-foreground"}>
                <span aria-hidden="true" className={current ? "text-primary" : "text-muted-foreground/60"}>{current ? "▸ " : "✓ "}</span>
                {step.label}
                {step.detail && <span className="block break-words pl-4 text-muted-foreground">{step.detail}</span>}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
