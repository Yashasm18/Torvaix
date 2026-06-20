"use client"

import { useState } from "react";
import { motion } from "framer-motion";
import { Zap, Plus, Clock, Play, Pause, Trash2, Calendar, Repeat, ArrowRight, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Automation {
  id: string;
  name: string;
  description: string;
  trigger: string;
  status: "active" | "paused" | "draft";
  lastRun: string;
  runCount: number;
  steps: number;
}

const SAMPLE_AUTOMATIONS: Automation[] = [
  {
    id: "1",
    name: "Daily Research Digest",
    description: "Every morning, search for new papers on local LLM deployment and summarize findings.",
    trigger: "Schedule: Daily 9:00 AM",
    status: "active",
    lastRun: "Today, 9:00 AM",
    runCount: 14,
    steps: 4,
  },
  {
    id: "2",
    name: "Memory Consolidation",
    description: "Review recent conversation memories, deduplicate, and strengthen important connections in the knowledge graph.",
    trigger: "Schedule: Weekly Sunday",
    status: "active",
    lastRun: "Last Sunday",
    runCount: 3,
    steps: 6,
  },
  {
    id: "3",
    name: "New File Indexer",
    description: "When a new file is added to the workspace, automatically extract key information and add to knowledge base.",
    trigger: "Event: File Created",
    status: "paused",
    lastRun: "3 days ago",
    runCount: 27,
    steps: 3,
  },
];

const statusConfig: Record<string, { dot: string; text: string; label: string }> = {
  active: { dot: "bg-green-500 animate-pulse", text: "text-green-400", label: "Active" },
  paused: { dot: "bg-amber-500", text: "text-amber-400", label: "Paused" },
  draft: { dot: "bg-slate-500", text: "text-muted-foreground", label: "Draft" },
};

export default function AutomationPage() {
  const [automations] = useState<Automation[]>(SAMPLE_AUTOMATIONS);

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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Automation</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Scheduled workflows and event-driven automations powered by your agents.
          </p>
        </div>
        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 rounded-lg">
          <Plus className="w-4 h-4" />
          New Automation
        </Button>
      </motion.div>

      {/* Automations List */}
      <div className="flex-1 px-6 pb-6 pt-4">
        <div className="flex flex-col gap-4">
          {automations.map((automation, index) => {
            const status = statusConfig[automation.status];
            return (
              <motion.div
                key={automation.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.06, duration: 0.3 }}
                className="bg-surface border border-border rounded-xl p-6 hover:border-primary/30 transition-all duration-200 group"
              >
                {/* Top Row */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                      <Zap className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                        {automation.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                        <span className={`text-xs font-mono ${status.text}`}>{status.label}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {automation.status === "active" ? (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-amber-400">
                        <Pause className="w-4 h-4" />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-green-400">
                        <Play className="w-4 h-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Description */}
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  {automation.description}
                </p>

                {/* Footer Meta */}
                <div className="flex items-center justify-between pt-3 border-t border-border/50">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3 h-3" />
                      {automation.trigger}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <GitBranch className="w-3 h-3" />
                      {automation.steps} steps
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Repeat className="w-3 h-3" />
                      {automation.runCount} runs
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {automation.lastRun}
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}

          {/* Create New */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: automations.length * 0.06 + 0.05, duration: 0.3 }}
            className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center gap-3 hover:border-primary/40 hover:bg-primary/5 transition-all cursor-pointer group"
          >
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center group-hover:bg-primary/10 group-hover:scale-105 transition-all">
              <Plus className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
              Create New Automation
            </span>
            <span className="text-xs text-muted-foreground">
              Schedule tasks, trigger on events, or chain agent workflows.
            </span>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
