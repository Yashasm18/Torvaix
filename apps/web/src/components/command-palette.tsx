"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { Activity, BookOpen, Bot, CheckSquare, Cpu, Database, Folder, Home, MessageSquare, Share2, Zap } from "lucide-react"
import { PAGE_TITLES } from "@/lib/nav"

const PAGES = [
  { href: "/chat", icon: MessageSquare, keywords: "ask message conversation" },
  { href: "/workspace", icon: Home, keywords: "home dashboard activity" },
  { href: "/projects", icon: Folder, keywords: "" },
  { href: "/knowledge", icon: BookOpen, keywords: "memories facts themes" },
  { href: "/graph", icon: Share2, keywords: "entities relationships" },
  { href: "/agents", icon: Bot, keywords: "status" },
  { href: "/tasks", icon: CheckSquare, keywords: "tools approvals commands runs" },
  { href: "/automation", icon: Zap, keywords: "schedule workflows" },
  { href: "/intelligence", icon: Cpu, keywords: "ollama llm" },
]

const DEVELOPER_PAGES = [
  { href: "/debug/memory", icon: Database, keywords: "debug store edit" },
  { href: "/debug/context", icon: Activity, keywords: "debug search retrieval" },
]

/** Quick navigation (⌘K / Ctrl+K). It jumps between pages; it doesn't search your content. */
export function CommandPalette() {
  const [open, setOpen] = React.useState(false)
  const router = useRouter()

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  const go = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  const item = ({ href, icon: Icon, keywords }: (typeof PAGES)[number]) => (
    <CommandItem key={href} value={`${PAGE_TITLES[href]} ${keywords}`} onSelect={() => go(href)}>
      <Icon className="mr-2 h-4 w-4" />
      <span>{PAGE_TITLES[href]}</span>
    </CommandItem>
  )

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Go to a page" description="Type a page name and press Enter.">
      {/* CommandDialog only provides the dialog; the cmdk parts need this <Command> around them. */}
      <Command>
        <CommandInput placeholder="Go to a page…" />
        <CommandList>
          <CommandEmpty>No page matches that.</CommandEmpty>
          <CommandGroup heading="Pages">{PAGES.map(item)}</CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Developer tools">{DEVELOPER_PAGES.map(item)}</CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
