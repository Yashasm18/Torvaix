"use client"

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Folder, Plus, Search, Clock, GitBranch, Star, MoreHorizontal, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDBStore } from "@/store/db-store";

interface Project {
  id: string;
  name: string;
  description: string;
  status: "active" | "archived" | "paused";
  lastModified: string;
  tags: string[];
  starred: boolean;
}

const SAMPLE_PROJECTS: Project[] = [
  {
    id: "1",
    name: "Torvaix Core",
    description: "Main workspace for Torvaix AI Operating System development.",
    status: "active",
    lastModified: "Just now",
    tags: ["typescript", "next.js", "ai"],
    starred: true,
  },
  {
    id: "2",
    name: "Research Notes",
    description: "Collection of research papers and annotated notes on local LLM deployment.",
    status: "active",
    lastModified: "2 hours ago",
    tags: ["research", "llm"],
    starred: false,
  },
  {
    id: "3",
    name: "API Integrations",
    description: "Exploratory project for third-party API connectors and MCP server tooling.",
    status: "paused",
    lastModified: "3 days ago",
    tags: ["api", "mcp"],
    starred: false,
  },
];

const statusColors: Record<string, string> = {
  active: "bg-green-500",
  paused: "bg-amber-500",
  archived: "bg-slate-500",
};

export default function ProjectsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [projects] = useState<Project[]>(SAMPLE_PROJECTS);

  const filtered = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
            Organize your work into focused projects with dedicated context and memory.
          </p>
        </div>
        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 rounded-lg">
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
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
      </div>

      {/* Project Grid */}
      <div className="flex-1 px-6 pb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <AnimatePresence>
            {filtered.map((project, index) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: index * 0.05, duration: 0.3 }}
                className="bg-surface border border-border rounded-xl p-5 hover:border-primary/40 hover:shadow-[0_0_20px_-5px_rgba(0,212,170,0.1)] transition-all duration-300 cursor-pointer group flex flex-col"
              >
                {/* Top Row */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Folder className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors">
                        {project.name}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${statusColors[project.status]}`} />
                        <span className="text-[11px] text-muted-foreground capitalize">{project.status}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {project.starred && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />}
                    <button className="p-1 rounded-md hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                </div>

                {/* Description */}
                <p className="text-sm text-muted-foreground leading-relaxed mb-4 flex-1 line-clamp-2">
                  {project.description}
                </p>

                {/* Footer */}
                <div className="flex items-center justify-between pt-3 border-t border-border/50">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {project.lastModified}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {project.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-mono"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Empty state / Create new */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: filtered.length * 0.05 + 0.05, duration: 0.3 }}
            className="border-2 border-dashed border-border rounded-xl p-5 flex flex-col items-center justify-center gap-3 min-h-[180px] hover:border-primary/40 hover:bg-primary/5 transition-all cursor-pointer group"
          >
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center group-hover:bg-primary/10 group-hover:scale-105 transition-all">
              <Plus className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
              Create New Project
            </span>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
