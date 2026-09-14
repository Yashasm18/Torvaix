"use client"

import * as React from "react"
import {
  Folder,
  Home,
  BookOpen,
  Bot,
  CheckSquare,
  Cpu,
  Zap,
  Settings,
  ChevronDown,
  Search,
  Plus,
  Database,
  MessageSquare,
  Loader2,
  Activity,
  Check,
  ShieldAlert
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroupLabel
} from "@/components/ui/sidebar"
import { useDBStore } from "@/store/db-store"
import { useActiveWorkspace } from "@/hooks/use-active-workspace"
import { SettingsDialog } from "../settings/settings-dialog"
import { MemoryModal } from "../chat/memory-modal"
import { getSystemStatusAction } from "@/actions/memory-actions"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import Link from "next/link"
import { AppLogo } from "@/components/ui/app-logo"

const ACTIVITY_REFRESH_MS = 30_000

interface WorkspaceActivity {
  activeAutomations: number
  pendingApprovals: number
}

export function AppSidebar() {
  const { workspaces, setActiveWorkspaceId, createWorkspace } = useDBStore()
  const { workspace: activeWorkspace, workspaceId } = useActiveWorkspace()
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [memoryOpen, setMemoryOpen] = React.useState(false)

  const [systemStatus, setSystemStatus] = React.useState({
    ollama: false, qdrant: false, sqlite: false, loading: true
  });
  const [activity, setActivity] = React.useState<WorkspaceActivity | null>(null)

  React.useEffect(() => {
    const fetchStatus = async () => {
      try {
        const status = await getSystemStatusAction();
        setSystemStatus({ ...status, loading: false });
      } catch {
        // Server restarts and redeploys invalidate Server Action ids; show offline instead of
        // throwing an unhandled rejection on every poll.
        setSystemStatus({ ollama: false, qdrant: false, sqlite: false, loading: false });
      }
    };
    fetchStatus();
    // Poll every 10 seconds
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    if (!workspaceId) return
    const ws = encodeURIComponent(workspaceId)
    let cancelled = false

    const loadActivity = async () => {
      try {
        const [statsRes, pendingRes] = await Promise.all([
          fetch(`/api/automations/stats?workspaceId=${ws}`, { cache: "no-store" }),
          fetch(`/api/agent/pending-actions?workspaceId=${ws}&status=pending`, { cache: "no-store" }),
        ])
        const stats = statsRes.ok ? await statsRes.json() : null
        const pending = pendingRes.ok ? await pendingRes.json() : null
        if (cancelled) return
        setActivity(
          stats || pending
            ? { activeAutomations: stats?.stats?.activeCount ?? 0, pendingApprovals: pending?.actions?.length ?? 0 }
            : null
        )
      } catch {
        if (!cancelled) setActivity(null)
      }
    }

    loadActivity()
    const interval = setInterval(loadActivity, ACTIVITY_REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [workspaceId])

  const handleCreateWorkspace = () => {
    const name = window.prompt("Workspace Name:")
    if (name) {
      createWorkspace(name, 'general')
    }
  }

  // Handle Command Palette trigger (we will implement global listener later)
  const openCommandPalette = () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))
  }

  const navItems = [
    { title: "Chat", icon: MessageSquare, href: "/chat" },
    { title: "Workspace", icon: Home, href: "/workspace" },
    { title: "Projects", icon: Folder, href: "/projects" },
    { title: "Knowledge", icon: BookOpen, href: "/knowledge" },
    { title: "Graph", icon: Database, href: "/graph" },
    { title: "Agents", icon: Bot, href: "/agents" },
    { title: "Tasks", icon: CheckSquare, href: "/tasks" },
    { title: "Intelligence", icon: Cpu, href: "/intelligence" },
    { title: "Automation", icon: Zap, href: "/automation" },
  ]

  return (
    <Sidebar className="border-r border-sidebar-border bg-sidebar-background">
      <SidebarHeader className="p-4 flex flex-col gap-4">
        {/* Workspace Switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger className="w-full flex justify-between items-center px-2 py-6 h-auto hover:bg-sidebar-accent hover:text-sidebar-accent-foreground outline-none border-none bg-transparent cursor-pointer rounded-md">
            <div className="flex items-center gap-3">
              <AppLogo size={32} animated={true} />
              <div className="flex flex-col items-start">
                <span className="font-semibold text-sm tracking-tight text-foreground">Torvaix</span>
                <span className="text-xs text-muted-foreground">{activeWorkspace?.name}</span>
              </div>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 bg-popover border-border">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Switch Workspace</DropdownMenuLabel>
              {workspaces.map((workspace) => (
                <DropdownMenuItem
                  key={workspace.id}
                  onClick={() => setActiveWorkspaceId(workspace.id)}
                  className="cursor-pointer hover:bg-accent hover:text-accent-foreground flex items-center justify-between"
                >
                  <span className="truncate">{workspace.name}</span>
                  {workspace.id === workspaceId && <Check className="h-4 w-4 text-primary shrink-0" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="bg-border" />
            <DropdownMenuItem onClick={handleCreateWorkspace} className="cursor-pointer text-primary hover:bg-primary/10">
              <Plus className="mr-2 h-4 w-4" /> Create Workspace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Universal Search Bar */}
        <button
          onClick={openCommandPalette}
          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-muted-foreground bg-sidebar-accent/50 hover:bg-sidebar-accent border border-sidebar-border rounded-md transition-colors"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">Search Everything...</span>
          <kbd className="hidden md:inline-flex h-5 items-center gap-1 rounded border border-sidebar-border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            <span className="text-xs">⌘</span>K
          </kbd>
        </button>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <Link href={item.href} className="w-full">
                    <SidebarMenuButton tooltip={item.title} className="flex items-center gap-3 px-3 py-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
              ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Debug Tools (Phase 2A Verification) */}
          <SidebarGroup>
            <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">
              Debug & Verification
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <Link href="/debug/memory" className="w-full">
                    <SidebarMenuButton tooltip="Memory Inspector">
                      <Database className="w-4 h-4" />
                      <span>Memory Inspector</span>
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <Link href="/debug/context" className="w-full">
                    <SidebarMenuButton tooltip="Context Debugger">
                      <Activity className="w-4 h-4" />
                      <span>Context Debugger</span>
                    </SidebarMenuButton>
                  </Link>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* System Status Indicators */}
          <div className="px-4 py-4 mt-auto">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">System Status</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Memory (SQLite)</span>
                {systemStatus.loading ? <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" /> : (
                  <span className={`flex items-center gap-1 ${systemStatus.sqlite ? 'text-green-500' : 'text-red-500'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${systemStatus.sqlite ? 'bg-green-500' : 'bg-red-500'}`} />
                    {systemStatus.sqlite ? 'Connected' : 'Offline'}
                  </span>
                )}
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Vector (Qdrant)</span>
                {systemStatus.loading ? <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" /> : (
                  <span className={`flex items-center gap-1 ${systemStatus.qdrant ? 'text-green-500' : 'text-red-500'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${systemStatus.qdrant ? 'bg-green-500' : 'bg-red-500'}`} />
                    {systemStatus.qdrant ? 'Connected' : 'Offline'}
                  </span>
                )}
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Embed (Ollama)</span>
                {systemStatus.loading ? <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" /> : (
                  <span className={`flex items-center gap-1 ${systemStatus.ollama ? 'text-green-500' : 'text-red-500'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${systemStatus.ollama ? 'bg-green-500' : 'bg-red-500'}`} />
                    {systemStatus.ollama ? 'Connected' : 'Offline'}
                  </span>
                )}
              </div>
            </div>
          </div>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border flex flex-col gap-4">
        {/* Workspace Activity */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">Workspace Activity</span>
          <div className="flex flex-col gap-1">
            <Link href="/automation" className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-sidebar-accent group">
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-primary" />
                <span className="text-sm text-foreground group-hover:text-sidebar-accent-foreground">Active automations</span>
              </div>
              <span className="text-[11px] text-muted-foreground font-mono">{activity ? activity.activeAutomations : "—"}</span>
            </Link>
            <Link href="/tasks" className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-sidebar-accent group">
              <div className="flex items-center gap-2">
                <ShieldAlert className={`w-3.5 h-3.5 ${activity?.pendingApprovals ? "text-amber-400" : "text-muted-foreground"}`} />
                <span className="text-sm text-foreground group-hover:text-sidebar-accent-foreground">Pending approvals</span>
              </div>
              <span className={`text-[11px] font-mono ${activity?.pendingApprovals ? "text-amber-400" : "text-muted-foreground"}`}>
                {activity ? activity.pendingApprovals : "—"}
              </span>
            </Link>
          </div>
        </div>

        <SidebarMenu className="gap-1">
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => setSettingsOpen(true)} className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
              <Settings className="h-4 w-4" />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
        <MemoryModal open={memoryOpen} onOpenChange={setMemoryOpen} />
      </SidebarFooter>
    </Sidebar>
  )
}
