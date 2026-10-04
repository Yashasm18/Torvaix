"use client"

import * as React from "react"
import { Monitor, Key, Shield, HardDrive, Moon, CheckCircle2, XCircle, Loader2, RefreshCw, Download } from "lucide-react"
import { useTheme } from "next-themes"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { THEMES } from "@/lib/themes"
import { useActiveWorkspace } from "@/hooks/use-active-workspace"
import { refreshSystemStatus, useSystemStatus } from "@/hooks/use-system-status"
import { exportWorkspaceAsJSON } from "@/lib/export"
import { WorkspaceManager } from "./workspace-manager"
import { ModelSettings } from "./model-settings"

function StatusLine({ label, ok, detail }: { label: string; ok: boolean | undefined; detail?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-border/50 last:border-0">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {detail && <div className="text-xs text-muted-foreground font-mono truncate">{detail}</div>}
      </div>
      {ok === undefined ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
      ) : ok ? (
        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 text-red-500 shrink-0" />
      )}
    </div>
  )
}

export function SettingsDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (o: boolean) => void }) {
  const { theme, setTheme } = useTheme()
  const { workspace } = useActiveWorkspace()
  const status = useSystemStatus()
  const [testing, setTesting] = React.useState(false)

  const testConnection = async () => {
    setTesting(true)
    await refreshSystemStatus()
    setTesting(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto bg-card border-border">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Appearance, the chat model and API keys, and the health of your local Torvaix services.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="general" orientation="vertical" className="flex flex-col md:flex-row gap-6 mt-2">
          <TabsList className="flex flex-row flex-wrap md:flex-col h-auto self-start shrink-0 bg-transparent items-stretch justify-start md:w-40 gap-1 p-0">
            <TabsTrigger value="general" className="flex-none h-9 md:w-full justify-start px-3 data-[state=active]:bg-muted">
              <Monitor className="h-4 w-4 mr-2" /> General
            </TabsTrigger>
            <TabsTrigger value="appearance" className="flex-none h-9 md:w-full justify-start px-3 data-[state=active]:bg-muted">
              <Moon className="h-4 w-4 mr-2" /> Appearance
            </TabsTrigger>
            <TabsTrigger value="providers" className="flex-none h-9 md:w-full justify-start px-3 data-[state=active]:bg-muted">
              <Key className="h-4 w-4 mr-2" /> Models &amp; keys
            </TabsTrigger>
            <TabsTrigger value="privacy" className="flex-none h-9 md:w-full justify-start px-3 data-[state=active]:bg-muted">
              <Shield className="h-4 w-4 mr-2" /> Privacy
            </TabsTrigger>
            <TabsTrigger value="local" className="flex-none h-9 md:w-full justify-start px-3 data-[state=active]:bg-muted">
              <HardDrive className="h-4 w-4 mr-2" /> Local AI
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 min-w-0">
            <TabsContent value="general" className="m-0 space-y-4">
              <h3 className="text-lg font-medium">General</h3>
              <div className="rounded-xl border border-border p-4 space-y-1">
                <StatusLine label="Active workspace" ok={workspace ? true : undefined} detail={workspace ? `${workspace.name} (${workspace.id})` : undefined} />
                <StatusLine label="Agent server" ok={status?.agent} detail={status?.agent ? "Reachable" : status ? "Not running. Start it with npm run dev" : undefined} />
                <StatusLine label="Chat model" ok={status ? !!status.model : undefined} detail={status?.model ? `${status.model.id} (${status.model.provider})` : undefined} />
              </div>
              <p className="text-xs text-muted-foreground">
                Change the chat model, or add an API key for a cloud provider, under <span className="text-foreground">Models &amp; keys</span>.
              </p>
              <div className="rounded-xl border border-border p-4 space-y-2">
                <div className="text-sm">Backup</div>
                <p className="text-xs text-muted-foreground">
                  Chats, notes and projects are stored in this browser, so clearing site data deletes them.
                  Export a copy to keep one.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!workspace}
                  onClick={() => workspace && exportWorkspaceAsJSON(workspace.id)}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" /> Export {workspace?.name ?? "workspace"}
                </Button>
              </div>
              <WorkspaceManager key={workspace?.id} />
            </TabsContent>

            <TabsContent value="appearance" className="m-0 space-y-4">
              <h3 className="text-lg font-medium">Theme</h3>
              <p className="text-sm text-muted-foreground">Choose how Torvaix looks.</p>
              <div className="grid grid-cols-2 gap-4 mt-4">
                {THEMES.map((t) => (
                  <button
                    type="button"
                    key={t.id}
                    className={`text-left border rounded-xl p-4 cursor-pointer transition-all ${theme === t.id ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-muted-foreground/50'}`}
                    onClick={() => setTheme(t.id)}
                  >
                    <div className="font-medium mb-1">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.description}</div>
                  </button>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="providers" className="m-0">
              <ModelSettings />
            </TabsContent>

            <TabsContent value="privacy" className="m-0 space-y-4">
              <h3 className="text-lg font-medium">Privacy</h3>
              <div className="rounded-xl border border-border p-4 bg-muted/30 space-y-2 text-sm text-muted-foreground">
                <p>Torvaix collects no telemetry.</p>
                <p>
                  Data leaves this computer only when you use a cloud model (your prompts and relevant memories go to that
                  provider), when the agent searches the web, or when an OpenAI key is set in <code className="font-mono">.env</code> and Ollama can&apos;t create
                  embeddings. Pages also load one font stylesheet from Fontshare.
                </p>
                <p>
                  Memories, automations and execution logs live in <code className="font-mono">~/.torvaix/data</code> on this machine.
                  Workspaces, chats and projects are stored in this browser.
                </p>
                <p>With Ollama as the chat model and no web search, your prompts stay on this computer.</p>
              </div>
            </TabsContent>

            <TabsContent value="local" className="m-0 space-y-4">
              <h3 className="text-lg font-medium">Local AI</h3>
              <p className="text-sm text-muted-foreground">
                Ollama endpoint used by the agent server (set with <code className="font-mono">OLLAMA_URL</code>).
              </p>
              <div className="rounded-xl border border-border p-4">
                <StatusLine label="Ollama" ok={status?.ollama} detail={status?.ollamaUrl ?? undefined} />
                <StatusLine label="Qdrant vector store" ok={status?.qdrant} detail={status && !status.qdrant ? "Optional; keyword search is used without it" : undefined} />
                <StatusLine
                  label="Embeddings"
                  ok={status ? !!status.embeddings && status.embeddings !== "none" : undefined}
                  detail={status?.embeddings ?? undefined}
                />
              </div>
              <Button variant="secondary" onClick={testConnection} disabled={testing} className="gap-2">
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Test connection
              </Button>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
