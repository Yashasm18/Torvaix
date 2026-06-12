"use client"

import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
// @ts-expect-error - useChat hook needs migration to @ai-sdk/react (AI SDK v6 breaking change)
import { useChat } from "ai"
import { Send, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"

export function ChatView({ chatId }: { chatId: string }) {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    id: chatId,
    api: '/api/chat'
  })

  return (
    <div className="flex flex-col h-full bg-background relative">
      <header className="px-4 py-3 border-b flex justify-between items-center bg-card/50 backdrop-blur">
        <h2 className="font-medium">Active Chat</h2>
        <Badge variant="secondary" className="gap-1.5">
          <Zap className="h-3.5 w-3.5 text-primary" fill="currentColor" />
          <span>Smart Router Active</span>
        </Badge>
      </header>
      
      <ScrollArea className="flex-1 p-4">
        <div className="max-w-3xl mx-auto space-y-6 pb-20">
          <AnimatePresence initial={false}>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {messages.map((m: any) => (
              <motion.div 
                key={m.id} 
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                initial={{ opacity: 0, y: 15, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              >
                <div className={`max-w-[80%] rounded-2xl px-5 py-3.5 shadow-sm ${
                  m.role === 'user' 
                    ? 'bg-primary text-primary-foreground rounded-tr-sm' 
                    : 'bg-muted/40 border border-border/50 backdrop-blur-sm rounded-tl-sm'
                }`}>
                  {m.role === 'assistant' && (
                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border/50 text-xs text-muted-foreground">
                      <Zap className="h-3 w-3 text-primary" />
                      <span>Routed via Torvaix Smart Engine</span>
                    </div>
                  )}
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <p>Send a message to begin.</p>
            </div>
          )}
        </div>
      </ScrollArea>

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
            onChange={handleInputChange}
            placeholder="Type your message..."
            className="min-h-[44px] max-h-32 resize-none border-0 focus-visible:ring-0 bg-transparent text-sm py-3"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                // form submission triggered programmatically
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
