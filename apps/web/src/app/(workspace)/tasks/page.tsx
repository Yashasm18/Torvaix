"use client"

import { useState } from "react";
import { motion } from "framer-motion";
import { CheckSquare, Circle, CheckCircle2, Clock, AlertCircle, Plus, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Task {
  id: string;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  priority: "low" | "medium" | "high";
  agent: string;
  createdAt: string;
}

const SAMPLE_TASKS: Task[] = [
  {
    id: "1",
    title: "Index project documentation",
    description: "Scan all markdown files in the workspace and add them to the knowledge graph.",
    status: "completed",
    priority: "high",
    agent: "Memory Agent",
    createdAt: "30 min ago",
  },
  {
    id: "2",
    title: "Research local embedding models",
    description: "Compare nomic-embed, mxbai-embed, and all-minilm for local vector embedding performance.",
    status: "in_progress",
    priority: "medium",
    agent: "Research Agent",
    createdAt: "1 hour ago",
  },
  {
    id: "3",
    title: "Set up CI/CD pipeline",
    description: "Create GitHub Actions workflow for automated testing and deployment to GitHub Pages.",
    status: "pending",
    priority: "medium",
    agent: "Coding Agent",
    createdAt: "2 hours ago",
  },
  {
    id: "4",
    title: "Optimize Qdrant collection schema",
    description: "Review current vector schema and optimize for faster semantic search queries.",
    status: "pending",
    priority: "low",
    agent: "System",
    createdAt: "Yesterday",
  },
];

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Circle className="w-4 h-4 text-muted-foreground" />,
  in_progress: <Clock className="w-4 h-4 text-blue-400 animate-pulse" />,
  completed: <CheckCircle2 className="w-4 h-4 text-green-500" />,
  failed: <AlertCircle className="w-4 h-4 text-red-500" />,
};

const priorityColors: Record<string, string> = {
  low: "text-slate-400 bg-slate-500/10 border-slate-500/20",
  medium: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  high: "text-red-400 bg-red-500/10 border-red-500/20",
};

export default function TasksPage() {
  const [tasks] = useState<Task[]>(SAMPLE_TASKS);

  const grouped = {
    in_progress: tasks.filter((t) => t.status === "in_progress"),
    pending: tasks.filter((t) => t.status === "pending"),
    completed: tasks.filter((t) => t.status === "completed"),
    failed: tasks.filter((t) => t.status === "failed"),
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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Tasks</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track agent work and queued operations across your workspace.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2 rounded-lg border-border text-muted-foreground hover:text-foreground">
            <Filter className="w-4 h-4" />
            Filter
          </Button>
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 rounded-lg">
            <Plus className="w-4 h-4" />
            New Task
          </Button>
        </div>
      </motion.div>

      {/* Task List */}
      <div className="flex-1 px-6 pb-6 pt-4 flex flex-col gap-6">
        {(["in_progress", "pending", "completed", "failed"] as const).map((section) => {
          const sectionTasks = grouped[section];
          if (sectionTasks.length === 0) return null;

          const labels: Record<string, string> = {
            in_progress: "In Progress",
            pending: "Pending",
            completed: "Completed",
            failed: "Failed",
          };

          return (
            <div key={section}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {labels[section]}
                </span>
                <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 font-mono">
                  {sectionTasks.length}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {sectionTasks.map((task, index) => (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.04, duration: 0.25 }}
                    className="bg-surface border border-border rounded-xl px-5 py-4 hover:border-primary/30 transition-all duration-200 cursor-pointer group flex items-center gap-4"
                  >
                    {/* Status Icon */}
                    <div className="shrink-0">{statusIcons[task.status]}</div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm text-foreground group-hover:text-primary transition-colors truncate">
                        {task.title}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{task.description}</p>
                    </div>

                    {/* Meta */}
                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border capitalize ${priorityColors[task.priority]}`}>
                        {task.priority}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono hidden md:inline">{task.agent}</span>
                      <span className="text-xs text-muted-foreground hidden lg:flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {task.createdAt}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
