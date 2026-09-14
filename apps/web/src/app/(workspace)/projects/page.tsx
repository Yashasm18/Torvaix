"use client"

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Folder, Plus, Search, Clock, Star, MoreHorizontal, Trash2, Pause, Play, Archive } from "lucide-react";
import type { Project, ProjectStatus } from "@torvaix/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDBStore } from "@/store/db-store";
import { useActiveWorkspace } from "@/hooks/use-active-workspace";
import { formatRelativeTime } from "@/lib/relative-time";

const statusColors: Record<ProjectStatus, string> = {
  active: "bg-green-500",
  paused: "bg-amber-500",
  archived: "bg-slate-500",
};

const STATUS_ORDER: Record<ProjectStatus, number> = { active: 0, paused: 1, archived: 2 };

function parseTags(value: string) {
  return Array.from(new Set(value.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))).slice(0, 5);
}

export default function ProjectsPage() {
  const { workspace, workspaceId } = useActiveWorkspace();
  const allProjects = useDBStore((s) => s.projects);
  const createProject = useDBStore((s) => s.createProject);
  const updateProject = useDBStore((s) => s.updateProject);
  const deleteProject = useDBStore((s) => s.deleteProject);

  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");

  const query = searchQuery.trim().toLowerCase();
  const projects = allProjects
    .filter((p) => p.workspaceId === workspaceId)
    .filter(
      (p) =>
        !query ||
        p.name.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query) ||
        p.tags.some((t) => t.includes(query))
    )
    .sort(
      (a, b) =>
        Number(b.starred) - Number(a.starred) ||
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

  const openCreate = () => {
    setName("");
    setDescription("");
    setTags("");
    setDialogOpen(true);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceId || !name.trim()) return;
    createProject(workspaceId, { name: name.trim(), description: description.trim(), tags: parseTags(tags) });
    setDialogOpen(false);
  };

  const handleDelete = (project: Project) => {
    if (window.confirm(`Delete project "${project.name}"?`)) deleteProject(project.id);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-y-auto">
      {/* Header */}
      <motion.div
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-6 pb-2 gap-4"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Projects</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organize your work in {workspace?.name ?? "this workspace"} into focused projects.
          </p>
        </div>
        <Button onClick={openCreate} disabled={!workspaceId} className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 rounded-lg">
          <Plus className="w-4 h-4" />
          New Project
        </Button>
      </motion.div>

      {/* Search */}
      <div className="px-6 py-3">
        <div className="flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-2 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/30 transition-all">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search projects..."
            aria-label="Search projects"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
      </div>

      {/* Project Grid */}
      <div className="flex-1 px-6 pb-6">
        {query && projects.length === 0 && (
          <p className="text-sm text-muted-foreground mb-4">No projects match &ldquo;{searchQuery}&rdquo;.</p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <AnimatePresence>
            {projects.map((project, index) => (
              <motion.div
                key={project.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: project.status === "archived" ? 0.6 : 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: index * 0.03, duration: 0.25 }}
                className="bg-surface border border-border rounded-xl p-5 hover:border-primary/40 hover:shadow-[0_0_20px_-5px_rgba(0,212,170,0.1)] transition-colors duration-300 group flex flex-col"
              >
                {/* Top Row */}
                <div className="flex items-start justify-between mb-3 gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                      <Folder className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-foreground text-sm truncate">{project.name}</h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${statusColors[project.status]}`} />
                        <span className="text-[11px] text-muted-foreground capitalize">{project.status}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      aria-label={project.starred ? "Unstar project" : "Star project"}
                      aria-pressed={project.starred}
                      onClick={() => updateProject(project.id, { starred: !project.starred })}
                      className="p-1 rounded-md hover:bg-muted"
                    >
                      <Star className={`w-3.5 h-3.5 ${project.starred ? "text-amber-400 fill-amber-400" : "text-muted-foreground"}`} />
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label="Project actions"
                        className="p-1 rounded-md hover:bg-muted outline-none border-none bg-transparent cursor-pointer"
                      >
                        <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-44 bg-popover border-border">
                        {project.status !== "active" && (
                          <DropdownMenuItem onClick={() => updateProject(project.id, { status: "active" })} className="cursor-pointer">
                            <Play className="mr-2 h-4 w-4" /> Mark active
                          </DropdownMenuItem>
                        )}
                        {project.status !== "paused" && (
                          <DropdownMenuItem onClick={() => updateProject(project.id, { status: "paused" })} className="cursor-pointer">
                            <Pause className="mr-2 h-4 w-4" /> Pause
                          </DropdownMenuItem>
                        )}
                        {project.status !== "archived" && (
                          <DropdownMenuItem onClick={() => updateProject(project.id, { status: "archived" })} className="cursor-pointer">
                            <Archive className="mr-2 h-4 w-4" /> Archive
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator className="bg-border" />
                        <DropdownMenuItem onClick={() => handleDelete(project)} className="cursor-pointer text-red-400">
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Description */}
                <p className="text-sm text-muted-foreground leading-relaxed mb-4 flex-1 line-clamp-2">
                  {project.description || <span className="italic opacity-60">No description</span>}
                </p>

                {/* Footer */}
                <div className="flex items-center justify-between gap-2 pt-3 border-t border-border/50">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                    <Clock className="w-3 h-3" />
                    {formatRelativeTime(project.updatedAt)}
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    {project.tags.map((tag) => (
                      <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-mono">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Create new */}
          {!query && (
            <button
              type="button"
              onClick={openCreate}
              disabled={!workspaceId}
              className="border-2 border-dashed border-border rounded-xl p-5 flex flex-col items-center justify-center gap-3 min-h-[180px] hover:border-primary/40 hover:bg-primary/5 transition-all cursor-pointer group"
            >
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center group-hover:bg-primary/10 group-hover:scale-105 transition-all">
                <Plus className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                {projects.length === 0 ? "Create your first project" : "Create New Project"}
              </span>
            </button>
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md bg-card border-border">
          <form onSubmit={handleCreate} className="space-y-4">
            <DialogHeader>
              <DialogTitle>New Project</DialogTitle>
              <DialogDescription>Projects are saved in this browser, inside {workspace?.name ?? "the current workspace"}.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="project-name">Name</Label>
              <Input id="project-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-description">Description</Label>
              <Textarea id="project-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={3} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-tags">Tags</Label>
              <Input id="project-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="research, llm" />
              <p className="text-xs text-muted-foreground">Comma-separated, up to 5.</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={!name.trim()}>Create Project</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
