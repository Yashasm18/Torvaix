"use client"

import * as React from "react"

export interface SystemStatus {
  agent: boolean
  sqlite: boolean
  qdrant: boolean
  ollama: boolean
  model: { id: string; provider: string } | null
  embeddings: string | null
  ollamaUrl: string | null
  providers: { id: string; name: string; ready: boolean }[]
}

const REFRESH_MS = 10_000

// One shared poller for every component that shows system status, so the sidebar,
// chat header and settings don't each hit the agent server on their own timers.
let snapshot: SystemStatus | null = null
let timer: ReturnType<typeof setInterval> | null = null
let inFlight: Promise<void> | null = null
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

export function refreshSystemStatus(): Promise<void> {
  inFlight ??= fetch("/api/system/status", { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null)
    .then((data: SystemStatus | null) => {
      snapshot = data ?? {
        agent: false, sqlite: false, qdrant: false, ollama: false,
        model: null, embeddings: null, ollamaUrl: null, providers: [],
      }
      emit()
    })
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) {
    refreshSystemStatus()
    timer = setInterval(refreshSystemStatus, REFRESH_MS)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

/** Live agent-server health: services, active chat model, provider readiness. `null` while loading. */
export function useSystemStatus(): SystemStatus | null {
  return React.useSyncExternalStore(subscribe, () => snapshot, () => null)
}
