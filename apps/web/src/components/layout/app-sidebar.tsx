"use client"

import * as React from "react"
import { motion } from "framer-motion"
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
  Terminal,
  Loader2,
  Activity
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
import { Button } from "../ui/button"
import { SettingsDialog } from "../settings/settings-dialog"
import { MemoryModal } from "../chat/memory-modal"
import { getSystemStatusAction } from "@/actions/memory-actions"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import Link from "next/link"
import { AppLogo } from "@/components/ui/app-logo"

export function AppSidebar() {
  const { workspaces, activeWorkspaceId, setActiveWorkspaceId, createWorkspace } = useDBStore()
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [memoryOpen, setMemoryOpen] = React.useState(false)
  
  const [systemStatus, setSystemStatus] = React.useState({
    ollama: false, qdrant: false, sqlite: false, loading: true
  });

  React.useEffect(() => {
    const fetchStatus = async () => {
      const status = await getSystemStatusAction();
      setSystemStatus({ ...status, loading: false });
    };
    fetchStatus();
    // Poll every 10 seconds
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0]

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
    { title: "Workspace", icon: Home, href: "/" },
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
                <span className="text-xs text-muted-foreground">{activeWorkspace?.name || "Personal"}</span>
              </div>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 bg-popover border-border">
            <DropdownMenuLabel>Switch Workspace</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-border" />
            {workspaces.map((workspace) => (
              <DropdownMenuItem 
                key={workspace.id} 
                onClick={() => setActiveWorkspaceId(workspace.id)}
                className="cursor-pointer hover:bg-accent hover:text-accent-foreground"
              >
                {workspace.name}
              </DropdownMenuItem>
            ))}
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
                  <SidebarMenuButton render={<Link href={item.href} />} className="flex items-center gap-3 px-3 py-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
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
        {/* Agent Dock */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">Active Agents</span>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-sidebar-accent cursor-pointer group">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                <span className="text-sm text-foreground group-hover:text-sidebar-accent-foreground">Research Agent</span>
              </div>
              <span className="text-[10px] text-primary font-mono">Running</span>
            </div>
            <div className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-sidebar-accent cursor-pointer group">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
                <span className="text-sm text-muted-foreground group-hover:text-sidebar-accent-foreground">Coding Agent</span>
              </div>
              <span className="text-[10px] text-muted-foreground font-mono">Idle</span>
            </div>
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
