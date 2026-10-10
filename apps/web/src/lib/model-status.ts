/** The parts of the system status that decide whether chat can answer. */
export interface ModelStatusInput {
  agent: boolean
  ollama: boolean
  model: { id: string; provider: string } | null
  providers: { id: string; name: string; ready: boolean }[]
}

export interface ChatModelState {
  /** `undefined` while the status is still loading. */
  ready: boolean | undefined
  /** The model runs on this computer (Ollama), so prompts don't leave it. */
  local: boolean
  /** What is wrong and what to do about it, or `null` when chat can answer. */
  problem: string | null
}

/**
 * Whether the chat model can answer right now. A model being chosen is not enough: Ollama has
 * to be running, or the cloud provider needs a key. The sidebar, settings and chat all showed
 * this differently, so settings called an unreachable model healthy.
 */
export function chatModelState(status: ModelStatusInput | null): ChatModelState {
  if (!status) return { ready: undefined, local: true, problem: null }

  const local = !status.model || status.model.provider === "ollama"
  if (!status.agent) {
    return { ready: false, local, problem: "The agent server isn't running. Start it with: npm run dev" }
  }
  if (!status.model) {
    return { ready: false, local, problem: "No chat model is set. Choose one in Settings, under Models & keys." }
  }
  if (local) {
    return status.ollama
      ? { ready: true, local, problem: null }
      : { ready: false, local, problem: "Ollama isn't running, so Torvaix can't answer yet. Start it with: ollama serve" }
  }
  const provider = status.providers.find((p) => p.id === status.model?.provider)
  return provider?.ready
    ? { ready: true, local, problem: null }
    : { ready: false, local, problem: `${provider?.name ?? status.model.provider} has no API key. Add one in Settings, under Models & keys.` }
}
