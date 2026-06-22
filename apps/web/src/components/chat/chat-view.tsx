"use client"

import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Send, Zap, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"

// ── Types ──

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface UseTorvaixChatReturn {
  messages: ChatMessage[]
  input: string
  setInput: (value: string) => void
  handleSubmit: (e: React.FormEvent) => void
  isLoading: boolean
  error: string | null
  clearError: () => void
}

// ── Custom useChat Hook (replaces ai SDK useChat) ──

function useTorvaixChat(chatId: string): UseTorvaixChatReturn {
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [input, setInput] = React.useState('')
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const clearError = React.useCallback(() => setError(null), [])

  const handleSubmit = React.useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMsg: ChatMessage = {
      id: `${Date.now()}-user`,
      role: 'user',
      content: input.trim(),
    }

    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsLoading(true)
    setError(null)

    const assistantId = `${Date.now()}-assistant`
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg],
          workspaceId: 'default',
          chatId,
        }),
      })

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`Server error ${res.status}: ${errText}`)
      }

      if (!res.body) {
        throw new Error('No response body')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let assistantText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })

        for (const line of chunk.split('\n')) {
          if (!line.trim()) continue

          // Parse AI SDK DataStream protocol
          // Format: "0:{JSON}" = text, "9:{JSON}" = tool call, "a:{JSON}" = tool result, "e:{JSON}" = trace
          const typeChar = line[0]
          const payload = line.slice(2) // skip "X:" prefix

          if (typeChar === '0') {
            try {
              const text = JSON.parse(payload)
              assistantText += text
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId ? { ...m, content: assistantText } : m
                )
              )
            } catch {
              // Not valid JSON, append raw
              assistantText += payload
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId ? { ...m, content: assistantText } : m
                )
              )
            }
          }
          // Tool calls and trace data are logged but not displayed in chat
        }
      }

      // If we got nothing, show a fallback
      if (!assistantText.trim()) {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? { ...m, content: 'No response received from agent.' }
              : m
          )
        )
      }
    } catch (err: any) {
      console.error('[Chat] Streaming error:', err)
      setError(err.message || 'Failed to get response')
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: `**Error:** ${err.message}` }
            : m
        )
      )
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, messages, chatId])

  return {
    messages,
    input,
    setInput,
    handleSubmit,
    isLoading,
    error,
    clearError,
  }
}

// ── Chat View Component ──

export function ChatView({ chatId }: { chatId: string }) {
  const { messages, input, setInput, handleSubmit, isLoading, error, clearError } =
    useTorvaixChat(chatId)

  const scrollRef = React.useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  return (
    <div className="flex flex-col h-full bg-background relative">
      {/* Header */}
      <header className="px-4 py-3 border-b flex justify-between items-center bg-card/50 backdrop-blur">
        <h2 className="font-medium">Active Chat</h2>
        <Badge variant="secondary" className="gap-1.5">
          <Zap className="h-3.5 w-3.5 text-primary" fill="currentColor" />
          <span>Smart Router Active</span>
        </Badge>
      </header>

      {/* Error Banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mx-4 mt-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg flex items-center gap-2 text-sm text-destructive"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={clearError} className="underline hover:no-underline">
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="max-w-3xl mx-auto space-y-6 pb-20">
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div
                key={m.id}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                initial={{ opacity: 0, y: 15, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-5 py-3.5 shadow-sm ${
                    m.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-tr-sm'
                      : 'bg-muted/40 border border-border/50 backdrop-blur-sm rounded-tl-sm'
                  }`}
                >
                  {m.role === 'assistant' && (
                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border/50 text-xs text-muted-foreground">
                      <Zap className="h-3 w-3 text-primary" />
                      <span>Routed via Torvaix Smart Engine</span>
                    </div>
                  )}
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">
                    {m.content || (isLoading ? '\u00A0' : '')}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-3">
              <Zap className="h-8 w-8 opacity-30" />
              <p>Send a message to begin.</p>
              <p className="text-xs opacity-60">
                Try: "Remember that my favorite framework is Next.js"
              </p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="absolute bottom-6 left-4 right-4 max-w-3xl mx-auto">
        <motion.form
          onSubmit={handleSubmit}
          className="relative flex items-center bg-card/70 backdrop-blur-xl border border-border/50 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] p-2 transition-colors focus-within:bg-card/90 focus-within:border-primary/50"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="min-h-[44px] max-h-32 resize-none border-0 focus-visible:ring-0 bg-transparent text-sm py-3"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                const form = e.currentTarget.form
                if (form) form.requestSubmit()
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            disabled={isLoading || !input.trim()}
            className="h-10 w-10 shrink-0 rounded-xl transition-all hover:scale-105 active:scale-95"
          >
            <Send className="h-4 w-4" />
          </Button>
        </motion.form>
      </div>
    </div>
  )
}
