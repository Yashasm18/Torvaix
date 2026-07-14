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
import { BrainCircuit } from "lucide-react"
import { useDBStore } from "@/store/db-store"
import { KnowledgePulse } from "../knowledge-pulse"

export function AppShell({ children }: { children: React.ReactNode }) {
  const { workspaces, createWorkspace } = useDBStore();
  const [isCreating, setIsCreating] = React.useState(false);
  const [workspaceName, setWorkspaceName] = React.useState("");

  if (workspaces.length === 0) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md p-8 border border-border bg-surface rounded-xl shadow-2xl flex flex-col items-center text-center"
        >
          <div className="h-12 w-12 bg-primary/20 rounded-full flex items-center justify-center mb-6">
            <BrainCircuit className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Welcome to Torvaix</h2>
          <p className="text-muted-foreground mb-8">Torvaix is a true multi-tenant AI operating system. To begin, create your first isolated workspace.</p>
          
          <form 
            className="w-full flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!workspaceName.trim()) return;
              setIsCreating(true);
              try {
                await createWorkspace(workspaceName, 'general');
              } finally {
                setIsCreating(false);
              }
            }}
          >
            <input 
              type="text" 
              placeholder="e.g. My AI Startup"
              className="w-full px-4 py-3 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              disabled={isCreating}
              autoFocus
            />
            <button 
              type="submit" 
              disabled={!workspaceName.trim() || isCreating}
              className="w-full py-3 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isCreating ? "Provisioning Workspace..." : "Create Workspace"}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <div className="flex-1 flex flex-col h-screen overflow-hidden bg-background">


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
              <div className="h-full w-full overflow-y-auto p-3">
                <KnowledgePulse />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </main>
      </div>
    </SidebarProvider>
  )
}
