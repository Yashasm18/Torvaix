"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { Folder, MessageSquare, StickyNote, Box, Plus, Command, Settings } from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useDBStore } from "@/store/db-store"
import { Button } from "../ui/button"
import { SettingsDialog } from "../settings/settings-dialog"

import { MemoryModal } from "../chat/memory-modal"
import { BrainCircuit } from "lucide-react"

export function AppSidebar() {
  const { workspaces, activeWorkspaceId, setActiveWorkspaceId, createWorkspace } = useDBStore()
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [memoryOpen, setMemoryOpen] = React.useState(false)

  const handleCreateWorkspace = () => {
    // Basic prompt for now, to be replaced with a dialog
    const name = window.prompt("Workspace Name:")
    if (name) {
      createWorkspace(name, 'general')
    }
  }

  return (
    <Sidebar className="border-r border-sidebar-border/50">
      <SidebarHeader className="p-4 flex flex-row items-center justify-between">
        <motion.div 
          className="flex items-center gap-2 px-2"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <motion.div 
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold shadow-[0_0_15px_var(--color-primary)]"
            whileHover={{ scale: 1.05, rotate: 5 }}
            whileTap={{ scale: 0.95 }}
          >
            T
          </motion.div>
          <span className="font-semibold text-lg tracking-tight">Torvaix</span>
        </motion.div>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="flex justify-between items-center group/label">
            Workspaces
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-5 w-5 opacity-0 group-hover/label:opacity-100 transition-opacity"
              onClick={handleCreateWorkspace}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {workspaces.map((workspace, index) => (
                <motion.div
                  key={workspace.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      isActive={activeWorkspaceId === workspace.id}
                      onClick={() => setActiveWorkspaceId(workspace.id)}
                      className="flex justify-between items-center relative overflow-hidden group"
                    >
                      {activeWorkspaceId === workspace.id && (
                        <motion.div 
                          layoutId="activeWorkspace"
                          className="absolute inset-0 bg-primary/10 rounded-md -z-10"
                          transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                        />
                      )}
                      <div className="flex items-center gap-2 z-10">
                        <Folder className={`h-4 w-4 transition-colors ${activeWorkspaceId === workspace.id ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`} />
                        <span className="transition-colors group-hover:text-foreground">{workspace.name}</span>
                      </div>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </motion.div>
              ))}
              {workspaces.length === 0 && (
                <motion.div 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }} 
                  className="p-4 text-sm text-muted-foreground text-center"
                >
                  No workspaces yet.<br/>
                  <Button variant="link" onClick={handleCreateWorkspace}>Create one</Button>
                </motion.div>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {activeWorkspaceId && (
          <SidebarGroup>
            <SidebarGroupLabel>Current Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <MessageSquare className="h-4 w-4" />
                    <span>Chats</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <StickyNote className="h-4 w-4" />
                    <span>Notes</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <Box className="h-4 w-4" />
                    <span>Files</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => setMemoryOpen(true)} className="text-[var(--brand-color)] hover:text-[var(--brand-color)] hover:bg-[var(--brand-color)]/10 transition-colors">
              <BrainCircuit className="h-4 w-4" />
              <span>Agent Memory</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton>
              <Command className="h-4 w-4" />
              <span>Command Palette (Ctrl+K)</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => setSettingsOpen(true)}>
              <Settings className="h-4 w-4" />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <MemoryModal open={memoryOpen} onOpenChange={setMemoryOpen} />
    </Sidebar>
  )
}
