import type { Chat, Message } from "@torvaix/types"

/** Messages kept per chat in browser storage; older ones are dropped first. */
export const MAX_STORED_MESSAGES = 200
export const DEFAULT_CHAT_TITLE = "New Chat"

// The chat page appends this marker to approve/deny messages so the API can resume the action.
const ACTION_MARKER = /\n?__PENDING_ACTION_ID__:[a-f0-9-]+/g

/** Chat message as held by useChat (and restored into it). */
export interface UiMessage {
  id: string
  role: string
  content: string
  createdAt?: Date | string
  toolInvocations?: unknown[]
}

/** Remove the internal pending-action marker so it never shows up in the UI or chat titles. */
export function stripActionMarker(text: string): string {
  return text.replace(ACTION_MARKER, "").trim()
}

function isStoredRole(role: string): role is Message["role"] {
  return role === "user" || role === "assistant" || role === "system"
}

/** Convert useChat messages to the persisted shape, keeping only the most recent ones. */
export function toStoredMessages(chatId: string, messages: UiMessage[], now = new Date()): Message[] {
  return messages
    .filter((m) => isStoredRole(m.role))
    .slice(-MAX_STORED_MESSAGES)
    .map((m) => ({
      id: m.id,
      chatId,
      role: m.role as Message["role"],
      content: m.content,
      createdAt: m.createdAt ? new Date(m.createdAt) : now,
      ...(m.toolInvocations?.length ? { toolInvocations: m.toolInvocations } : {}),
    }))
}

/** Restore a chat's persisted messages in the shape useChat expects. */
export function toUiMessages(messages: Message[], chatId: string): UiMessage[] {
  return messages
    .filter((m) => m.chatId === chatId)
    .map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: new Date(m.createdAt),
      ...(m.toolInvocations?.length ? { toolInvocations: m.toolInvocations } : {}),
    }))
}

/** Title from the first real user message, or null if there isn't one yet. */
export function deriveChatTitle(messages: Pick<UiMessage, "role" | "content">[], maxLength = 48): string | null {
  const first = messages.find((m) => m.role === "user" && stripActionMarker(m.content))
  if (!first) return null
  const text = stripActionMarker(first.content).replace(/\s+/g, " ")
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text
}

/** The workspace's selected chat, else its most recently updated one. */
export function pickActiveChat(chats: Chat[], workspaceId: string, activeId: string | undefined): Chat | null {
  const own = chats.filter((c) => c.workspaceId === workspaceId)
  return (
    own.find((c) => c.id === activeId) ??
    [...own].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] ??
    null
  )
}

/** Cheap change detector for message lists, including text still streaming in. */
export function messagesSignature(messages: UiMessage[]): string {
  return messages.map((m) => `${m.id}:${m.content.length}:${m.toolInvocations?.length ?? 0}`).join("|")
}

/** Wrap an attached file in a code fence longer than any backtick run inside it. */
export function formatAttachment(fileName: string, text: string): string {
  const longestRun = Math.max(0, ...Array.from(text.matchAll(/`+/g), (m) => m[0].length))
  const fence = "`".repeat(Math.max(3, longestRun + 1))
  return `File: ${fileName}\n${fence}\n${text.replace(/\n$/, "")}\n${fence}`
}
