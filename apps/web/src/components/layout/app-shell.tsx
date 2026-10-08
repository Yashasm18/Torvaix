"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { usePathname } from "next/navigation"
import { pageTitle } from "@/lib/nav"
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
import { useAnswerDetailsStore } from "@/store/answer-details-store"
import { useActiveWorkspace } from "@/hooks/use-active-workspace"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useSystemStatus } from "@/hooks/use-system-status"
import { AnswerDetails } from "../answer-details"
import { CommandPalette } from "../command-palette"

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
  const { workspace, workspaceId } = useActiveWorkspace();
  const pathname = usePathname();
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

  // The details panel describes replies in the open chat, which belong to one workspace.
  React.useEffect(() => {
    useAnswerDetailsStore.getState().reset();
  }, [workspaceId]);

  // "How I answered" under a reply asks for the panel to be shown.
  const openRequests = useAnswerDetailsStore((s) => s.openRequests);
  const handledOpenRequests = React.useRef(openRequests);
  React.useEffect(() => {
    if (openRequests === handledOpenRequests.current) return;
    handledOpenRequests.current = openRequests;
    if (isWide) setPulseOpen(true);
    else setPulseSheetOpen(true);
  }, [openRequests, isWide]);

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

  // Reading the saved data normally takes a few milliseconds. If it fails (site data blocked,
  // a private window, a damaged entry) the store never reports that it finished, and the app
  // used to stay a blank page with no explanation.
  const [storageStuck, setStorageStuck] = React.useState(false);
  React.useEffect(() => {
    if (hasHydrated) return;
    const timer = setTimeout(() => setStorageStuck(true), 5000);
    return () => clearTimeout(timer);
  }, [hasHydrated]);

  if (!hasHydrated) {
    if (!storageStuck) return null;
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background px-4">
        <div role="alert" className="w-full max-w-md p-8 border border-border bg-surface rounded-xl text-center space-y-4">
          <h2 className="text-xl font-bold text-foreground">Torvaix couldn&apos;t read its saved data</h2>
          <p className="text-sm text-muted-foreground">
            Your workspaces and chats are kept in this browser. The browser may be blocking site data for this
            address, for example in a private window or with cookies and site data turned off. Allow site data
            for this page, then reload.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/90 transition-colors"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }

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
          <p className="text-muted-foreground mb-8">A workspace keeps the chats, memories and files for one project together, separate from the rest. Name your first one to get started.</p>

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

  // The panel describes chat replies, so it only belongs next to the chat.
  const onChat = pathname === "/" || pathname === "/chat" || (pathname?.startsWith("/chat/") ?? false);
  const showSidePanel = isWide && pulseOpen && onChat;

  return (
    <SidebarProvider>
      {/* The page switcher (⌘K). It was never mounted, so the sidebar button and shortcut did nothing. */}
      <CommandPalette />
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
          <div className="flex items-center gap-2 min-w-0 text-sm tracking-tight">
            {workspace?.name && (
              <>
                <span className="hidden sm:inline truncate max-w-[12rem] text-muted-foreground">{workspace.name}</span>
                <span className="hidden sm:inline text-muted-foreground/50" aria-hidden>/</span>
              </>
            )}
            <span className="font-semibold truncate">{pageTitle(pathname)}</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-1.5" title={status && !status.agent ? "Start the agent server with npm run dev" : undefined}>
              <div className={`h-2 w-2 rounded-full ${connection.dot}`} />
              <span className="text-xs text-muted-foreground">{connection.label}</span>
            </div>
            {onChat && <button
              type="button"
              onClick={togglePulse}
              aria-label={showSidePanel ? "Hide answer details" : "Show answer details"}
              title={showSidePanel ? "Hide answer details" : "Show how the last reply was answered"}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              {showSidePanel ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            </button>}
          </div>
        </motion.header>
        <main className="flex-1 min-h-0 overflow-hidden animate-in fade-in duration-500">
          {/* The page keeps the same place in the tree whether or not the details panel is shown.
              It used to move between two different parents, which rebuilt the whole page on every
              toggle: a half-typed message and the reply details were lost. Sizes are strings
              because this library reads plain numbers as pixels, not percentages. */}
          <ResizablePanelGroup orientation="horizontal">
            <ResizablePanel id="page" defaultSize="70%" minSize="50%">
              <div className="h-full w-full flex flex-col overflow-hidden">{children}</div>
            </ResizablePanel>
            {showSidePanel && <ResizableHandle withHandle />}
            {showSidePanel && (
              <ResizablePanel id="answer-details" defaultSize="30%" minSize="20%" className="bg-surface border-l border-border flex flex-col">
                <div className="h-full w-full overflow-y-auto p-3">
                  <AnswerDetails />
                </div>
              </ResizablePanel>
            )}
          </ResizablePanelGroup>
        </main>
      </div>

      {!isWide && (
        <Sheet open={pulseSheetOpen} onOpenChange={setPulseSheetOpen}>
          <SheetContent side="right" className="w-[92vw] sm:max-w-md overflow-y-auto p-3">
            <SheetHeader className="sr-only">
              <SheetTitle>How I answered</SheetTitle>
            </SheetHeader>
            <AnswerDetails compact />
          </SheetContent>
        </Sheet>
      )}
    </SidebarProvider>
  )
}
