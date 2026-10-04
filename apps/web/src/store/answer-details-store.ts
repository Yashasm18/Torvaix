import { create } from "zustand"
import type { AnswerTurn } from "@/lib/answer-details"

/**
 * What the agent did for each reply in the open chat, for the "How I answered" panel.
 * Kept in memory only: it describes this session's replies and is rebuilt as you chat.
 */
interface AnswerDetailsState {
  /** The most recent reply's details. */
  latest: AnswerTurn | null
  /** Details per assistant message id, so an earlier reply can be looked at again. */
  byMessage: Record<string, AnswerTurn>
  /** The reply being shown. `null` follows the latest one. */
  selectedMessageId: string | null
  /** Bumped to ask the layout to open the panel. */
  openRequests: number

  record: (turn: AnswerTurn) => void
  attach: (messageId: string, turn: AnswerTurn) => void
  select: (messageId: string | null) => void
  requestOpen: () => void
  reset: () => void
  /** A memory was edited or deleted from the panel: keep every reply that shows it in step. */
  updateMemory: (id: string, content: string) => void
  removeMemory: (id: string) => void
}

function mapTurns(state: AnswerDetailsState, change: (turn: AnswerTurn) => AnswerTurn) {
  return {
    latest: state.latest ? change(state.latest) : null,
    byMessage: Object.fromEntries(Object.entries(state.byMessage).map(([id, turn]) => [id, change(turn)])),
  }
}

export const useAnswerDetailsStore = create<AnswerDetailsState>((set) => ({
  latest: null,
  byMessage: {},
  selectedMessageId: null,
  openRequests: 0,

  record: (turn) => set({ latest: turn, selectedMessageId: null }),
  attach: (messageId, turn) => set((state) => ({ byMessage: { ...state.byMessage, [messageId]: turn } })),
  select: (messageId) => set({ selectedMessageId: messageId }),
  requestOpen: () => set((state) => ({ openRequests: state.openRequests + 1 })),
  reset: () => set({ latest: null, byMessage: {}, selectedMessageId: null }),

  updateMemory: (id, content) =>
    set((state) =>
      mapTurns(state, (turn) => ({
        ...turn,
        retrievedMemories: turn.retrievedMemories.map((m) => (m.id === id ? { ...m, content } : m)),
        savedMemory: turn.savedMemory?.id === id ? { id, content } : turn.savedMemory,
      }))
    ),

  removeMemory: (id) =>
    set((state) =>
      mapTurns(state, (turn) => ({
        ...turn,
        retrievedMemories: turn.retrievedMemories.filter((m) => m.id !== id),
        savedMemory: turn.savedMemory?.id === id ? null : turn.savedMemory,
        savedUndone: turn.savedUndone || turn.savedMemory?.id === id,
      }))
    ),
}))

/** The reply the panel should show: the selected one, or the latest. */
export function selectShownTurn(state: Pick<AnswerDetailsState, "latest" | "byMessage" | "selectedMessageId">): AnswerTurn | null {
  return (state.selectedMessageId && state.byMessage[state.selectedMessageId]) || state.latest
}
