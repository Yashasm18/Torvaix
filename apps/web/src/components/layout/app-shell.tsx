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

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <div className="flex-1 flex flex-col h-screen overflow-hidden bg-background">
        <motion.header 
          className="h-14 border-b border-border/50 flex items-center px-4 gap-3 shrink-0 bg-card/50 backdrop-blur-md"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <SidebarTrigger className="transition-transform hover:scale-105 active:scale-95" />
          <div className="h-4 w-px bg-border/50" />
          <div className="font-semibold text-sm tracking-tight">Torvaix Workspace</div>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-muted-foreground">Connected</span>
          </div>
        </motion.header>
        <main className="flex-1 overflow-hidden animate-in fade-in duration-500">
          <ResizablePanelGroup orientation="horizontal">
            <ResizablePanel defaultSize={60} minSize={30}>
              {children}
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={40} minSize={20}>
              <div className="h-full w-full flex items-center justify-center text-muted-foreground p-8 bg-card/20 relative overflow-hidden">
                {/* Subtle background gradient */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.02] to-accent/[0.02] pointer-events-none" />
                <motion.div 
                  className="text-center relative z-10"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3, duration: 0.4 }}
                >
                  <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-muted/50 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-40">
                      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" x2="8" y1="13" y2="13" />
                      <line x1="16" x2="8" y1="17" y2="17" />
                      <line x1="10" x2="8" y1="9" y2="9" />
                    </svg>
                  </div>
                  <p className="font-medium mb-1">Notes &amp; Context</p>
                  <p className="text-sm opacity-50">Select a note from the sidebar</p>
                </motion.div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </main>
      </div>
    </SidebarProvider>
  )
}

