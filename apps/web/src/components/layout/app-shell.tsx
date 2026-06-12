"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { AppSidebar } from "./app-sidebar"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { BrainCircuit, Clock, FileText } from "lucide-react"
import { useMemoryContextStore } from "@/store/memory-context-store"

export function AppShell({ children }: { children: React.ReactNode }) {
  const { retrievedMemories, averageConfidence, lastRetrievedAt } = useMemoryContextStore();

  return (
    <SidebarProvider>
      <AppSidebar />
      <div className="flex-1 flex flex-col h-screen overflow-hidden bg-background">
        {/* Global Activity Layer */}
        <motion.div 
          className="h-6 w-full bg-primary/10 border-b border-primary/20 flex items-center px-4 gap-2 text-xs font-mono text-primary z-50 shrink-0"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 24 }}
          transition={{ delay: 0.5 }}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="truncate">Agent Researching Market Trends...</span>
        </motion.div>

        <motion.header 
          className="h-14 border-b border-border/50 flex items-center px-4 gap-3 shrink-0 bg-surface/50 backdrop-blur-md"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <SidebarTrigger className="transition-transform hover:scale-105 active:scale-95" />
          <div className="h-4 w-px bg-border/50" />
          <div className="font-semibold text-sm tracking-tight">Torvaix Workspace</div>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs text-muted-foreground">Connected</span>
          </div>
        </motion.header>
        <main className="flex-1 overflow-hidden animate-in fade-in duration-500">
          <ResizablePanelGroup orientation="horizontal">
            <ResizablePanel defaultSize={70} minSize={50}>
              {children}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={30} minSize={20} className="bg-surface border-l border-border flex flex-col">
              <div className="h-full w-full flex flex-col relative overflow-hidden">
                <div className="p-4 border-b border-border flex items-center gap-2">
                  <BrainCircuit className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">Knowledge Context</span>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
                  
                  {/* Memory Confidence */}
                  <div>
                    <div className="flex justify-between items-end mb-2">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Memory Confidence</span>
                      <span className="text-primary font-mono text-sm">{averageConfidence > 0 ? `${averageConfidence}%` : 'N/A'}</span>
                    </div>
                    <div className="h-1.5 w-full bg-background rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${averageConfidence}%` }} />
                    </div>
                  </div>

                  {/* Sources Retrieved */}
                  <div>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 block">Knowledge Retrieved</span>
                    <ul className="space-y-3">
                      {retrievedMemories.length === 0 ? (
                        <div className="text-sm text-muted-foreground italic">No memories active in context.</div>
                      ) : (
                        retrievedMemories.map((mem, index) => (
                          <li key={index} className="flex items-start gap-3 bg-background border border-border p-3 rounded-lg hover:border-primary/50 transition-colors cursor-pointer group">
                            <FileText className="h-4 w-4 text-muted-foreground group-hover:text-primary mt-0.5 shrink-0" />
                            <div className="flex flex-col">
                              <span className="text-sm text-foreground line-clamp-2">{mem.content}</span>
                              <span className="text-xs text-muted-foreground mt-1">Source: {mem.source}</span>
                            </div>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>

                </div>
                
                {/* Footer timestamp */}
                {lastRetrievedAt && (
                  <div className="p-4 border-t border-border mt-auto flex items-center gap-2 text-xs text-muted-foreground bg-background/50">
                    <Clock className="h-3 w-3" />
                    <span>Retrieved at {lastRetrievedAt.toLocaleTimeString()}</span>
                  </div>
                )}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </main>
      </div>
    </SidebarProvider>
  )
}
