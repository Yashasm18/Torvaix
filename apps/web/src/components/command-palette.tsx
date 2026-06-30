"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { Search, Plus, Bot, Cpu, CheckSquare } from "lucide-react"

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

  const runCommand = (command: () => void) => {
    setOpen(false)
    command()
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search Everything..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => runCommand(() => router.push('/knowledge'))}>
            <Search className="mr-2 h-4 w-4" />
            <span>Search Knowledge</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/projects/new'))}>
            <Plus className="mr-2 h-4 w-4" />
            <span>Create Project</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/agents'))}>
            <Bot className="mr-2 h-4 w-4" />
            <span>Run Agent</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/models'))}>
            <Cpu className="mr-2 h-4 w-4" />
            <span>Switch Model</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/tasks'))}>
            <CheckSquare className="mr-2 h-4 w-4" />
            <span>Open Task</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => runCommand(() => router.push('/workspace'))}>
            Workspace
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push('/chat'))}>
            Ask Torvaix
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
