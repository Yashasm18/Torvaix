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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { BrainCircuit, PanelRightClose, PanelRightOpen } from "lucide-react"
import { useDBStore } from "@/store/db-store"
import { useMemoryContextStore } from "@/store/memory-context-store"
import { useActiveWorkspace } from "@/hooks/use-active-workspace"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useSystemStatus } from "@/hooks/use-system-status"
import { KnowledgePulse } from "../knowledge-pulse"

const PULSE_PREF_KEY = "torvaix:knowledge-pulse-open"

function readPulsePreference(): boolean {
  if (typeof window === "undefined") return true
  try {
    return window.localStorage.getItem(PULSE_PREF_KEY) !== "false"
  } catch {
    return true
  }
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { workspaces, createWorkspace } = useDBStore();
  const { workspaceId } = useActiveWorkspace();
  const [isCreating, setIsCreating] = React.useState(false);
  const [workspaceName, setWorkspaceName] = React.useState("");

  // The side panel needs real width; below this it would squeeze the page to an unusable column,
  // so smaller screens get it as a slide-over instead.
  const isWide = useMediaQuery("(min-width: 1024px)");
  const [pulseOpen, setPulseOpen] = React.useState(readPulsePreference);
  const [pulseSheetOpen, setPulseSheetOpen] = React.useState(false);
  const status = useSystemStatus();

  // Workspaces load asynchronously from IndexedDB. Rendering before that finishes would
  // flash onboarding for existing users and could create a workspace hydration overwrites.
  const hasHydrated = React.useSyncExternalStore(
    (onChange) => useDBStore.persist.onFinishHydration(onChange),
    () => useDBStore.persist.hasHydrated(),
    () => false
  );

  // The Knowledge Pulse panel describes the last agent turn, which belongs to one workspace.
  React.useEffect(() => {
    useMemoryContextStore.getState().resetKnowledgePulse();
  }, [workspaceId]);

  const togglePulse = () => {
    if (!isWide) {
      setPulseSheetOpen(true);
      return;
    }
    setPulseOpen((open) => {
      try {
        window.localStorage.setItem(PULSE_PREF_KEY, String(!open));
      } catch { /* storage unavailable: preference just isn't remembered */ }
      return !open;
    });
  };

  if (!hasHydrated) return null;

  if (workspaces.length === 0) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md p-8 border border-border bg-surface rounded-xl shadow-2xl flex flex-col items-center text-center"
        >
          <div className="h-12 w-12 bg-primary/20 rounded-full flex items-center justify-center mb-6">
            <BrainCircuit className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Welcome to Torvaix</h2>
          <p className="text-muted-foreground mb-8">Workspaces keep chats, memories and files for each project separate. Name your first one to get started.</p>

          <form
            className="w-full flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!workspaceName.trim()) return;
              setIsCreating(true);
              try {
                await createWorkspace(workspaceName.trim(), 'general');
              } finally {
                setIsCreating(false);
              }
            }}
          >
            <input
              type="text"
              placeholder="e.g. My AI Startup"
              aria-label="Workspace name"
              maxLength={60}
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

  const connection =
    status === null
      ? { dot: "bg-muted-foreground", label: "Checking…" }
      : status.agent
        ? { dot: "bg-primary animate-pulse", label: "Connected" }
        : { dot: "bg-red-500", label: "Agent offline" };

  const showSidePanel = isWide && pulseOpen;

  return (
    <SidebarProvider>
      <AppSidebar />
      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-hidden bg-background">
        <motion.header
          className="h-14 border-b border-border/50 flex items-center px-4 gap-3 shrink-0 bg-surface/50 backdrop-blur-md"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <SidebarTrigger className="transition-transform hover:scale-105 active:scale-95" />
          <div className="h-4 w-px bg-border/50" />
          <div className="font-semibold text-sm tracking-tight truncate">Torvaix Workspace</div>
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-1.5" title={status && !status.agent ? "Start the agent server with npm run dev" : undefined}>
              <div className={`h-2 w-2 rounded-full ${connection.dot}`} />
              <span className="text-xs text-muted-foreground">{connection.label}</span>
            </div>
            <button
              type="button"
              onClick={togglePulse}
              aria-label={showSidePanel ? "Hide Knowledge Pulse" : "Show Knowledge Pulse"}
              title={showSidePanel ? "Hide Knowledge Pulse" : "Show Knowledge Pulse"}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              {showSidePanel ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            </button>
          </div>
        </motion.header>
        <main className="flex-1 min-h-0 overflow-hidden animate-in fade-in duration-500">
          {showSidePanel ? (
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
          ) : (
            <div className="h-full w-full flex flex-col overflow-hidden">{children}</div>
          )}
        </main>
      </div>

      {!isWide && (
        <Sheet open={pulseSheetOpen} onOpenChange={setPulseSheetOpen}>
          <SheetContent side="right" className="w-[92vw] sm:max-w-md overflow-y-auto p-3">
            <SheetHeader className="sr-only">
              <SheetTitle>Knowledge Pulse</SheetTitle>
            </SheetHeader>
            <KnowledgePulse compact />
          </SheetContent>
        </Sheet>
      )}
    </SidebarProvider>
  )
}
