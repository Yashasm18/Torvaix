"use client"

import { useState } from "react";
import { motion } from "framer-motion";
import { Bot, Play, Pause, RotateCcw, Settings2, Zap, Shield, Brain, Search as SearchIcon, Terminal as TerminalIcon, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Agent {
  id: string;
  name: string;
  description: string;
  status: "running" | "idle" | "error" | "paused";
  type: "research" | "coding" | "system" | "custom";
  lastRun: string;
  capabilities: string[];
}

const AGENTS: Agent[] = [
  {
    id: "research",
    name: "Research Agent",
    description: "Multi-step research runs that gather, read, and synthesize sources into written reports.",
    status: "idle",
    type: "research",
    lastRun: "10 min ago",
    capabilities: ["Web Search", "Document Reading", "Summarization"],
  },
  {
    id: "coding",
    name: "Coding Agent",
    description: "Writes, reviews, and refactors code. Can execute scripts in sandboxed environments.",
    status: "idle",
    type: "coding",
    lastRun: "1 hour ago",
    capabilities: ["Code Generation", "File I/O", "Bash Execution"],
  },
  {
    id: "orchestrator",
    name: "Orchestrator",
    description: "Routes tasks between agents, manages workflow state, and handles security confirmations.",
    status: "running",
    type: "system",
    lastRun: "Active",
    capabilities: ["Task Routing", "Memory Access", "MCP Tools"],
  },
  {
    id: "memory",
    name: "Memory Agent",
    description: "Stores and retrieves knowledge from the vector database. Builds the knowledge graph over time.",
    status: "running",
    type: "system",
    lastRun: "Active",
    capabilities: ["Vector Search", "Knowledge Storage", "Graph Building"],
  },
];

const statusConfig: Record<string, { color: string; label: string; dot: string }> = {
  running: { color: "text-green-400", label: "Running", dot: "bg-green-500 animate-pulse" },
  idle: { color: "text-muted-foreground", label: "Idle", dot: "bg-slate-500" },
  error: { color: "text-red-400", label: "Error", dot: "bg-red-500" },
  paused: { color: "text-amber-400", label: "Paused", dot: "bg-amber-500" },
};

const typeIcons: Record<string, React.ReactNode> = {
  research: <SearchIcon className="w-5 h-5" />,
  coding: <TerminalIcon className="w-5 h-5" />,
  system: <Zap className="w-5 h-5" />,
  custom: <Bot className="w-5 h-5" />,
};

export default function AgentsPage() {
  const [agents] = useState<Agent[]>(AGENTS);

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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Agents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Autonomous AI agents that plan, execute tools, and complete tasks for you.
          </p>
        </div>
        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 rounded-lg">
          <Bot className="w-4 h-4" />
          Create Agent
        </Button>
      </motion.div>

      {/* Agent Cards */}
      <div className="flex-1 px-6 pb-6 pt-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {agents.map((agent, index) => {
            const status = statusConfig[agent.status];
            return (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.06, duration: 0.3 }}
                className="bg-surface border border-border rounded-xl p-6 hover:border-primary/30 transition-all duration-200 group"
              >
                {/* Agent Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                      {typeIcons[agent.type]}
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{agent.name}</h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                        <span className={`text-xs font-mono ${status.color}`}>{status.label}</span>
                        <span className="text-xs text-muted-foreground">• {agent.lastRun}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {agent.status === "running" ? (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-amber-400">
                        <Pause className="w-4 h-4" />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-green-400">
                        <Play className="w-4 h-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                      <Settings2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Description */}
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  {agent.description}
                </p>

                {/* Capabilities */}
                <div className="flex flex-wrap gap-1.5">
                  {agent.capabilities.map((cap) => (
                    <span
                      key={cap}
                      className="text-[10px] px-2.5 py-1 rounded-full bg-muted border border-border text-muted-foreground font-mono"
                    >
                      {cap}
                    </span>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
