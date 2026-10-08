"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Bot, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadError } from "@/components/load-error";
import { AgentCard } from "@/components/agents/agent-card";
import { AgentFormDialog } from "@/components/agents/agent-form-dialog";
import { AgentRunDialog } from "@/components/agents/agent-run-dialog";
import { BuiltInAgents } from "@/components/agents/built-in-agents";
import { DeleteAgentDialog } from "@/components/agents/delete-agent-dialog";
import { NO_RESPONSE } from "@/lib/api-error";
import { fetchAgents, type Agent, type AgentToolInfo } from "@/lib/agents";
import { useActiveWorkspace } from "@/hooks/use-active-workspace";
import { useSystemStatus } from "@/hooks/use-system-status";

export default function AgentsPage() {
  const { workspaceId } = useActiveWorkspace();
  const status = useSystemStatus();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [tools, setTools] = useState<AgentToolInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Each dialog keeps its agent after it closes, so it doesn't change while it fades out.
  const [formOpen, setFormOpen] = useState(false);
  const [formAgent, setFormAgent] = useState<Agent | null>(null);
  const [runOpen, setRunOpen] = useState(false);
  const [runAgent, setRunAgent] = useState<Agent | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteAgent, setDeleteAgent] = useState<Agent | null>(null);

  // The workspace on screen now. A reply for one the user has since left must not be shown.
  const currentWorkspace = useRef(workspaceId);
  useEffect(() => {
    currentWorkspace.current = workspaceId;
  }, [workspaceId]);
  // Only the newest request may fill the page, so a slow older reply can't undo a newer one.
  const latestLoad = useRef(0);

  const loadAgents = async (showSpinner = true) => {
    // A late call from a workspace the user has left (a closed run dialog settling) must not
    // take over the counter, or the load for the workspace on screen would be dropped as old.
    if (!workspaceId || currentWorkspace.current !== workspaceId) return;
    const request = ++latestLoad.current;
    const outdated = () => currentWorkspace.current !== workspaceId || request !== latestLoad.current;
    if (showSpinner) setLoading(true);
    try {
      const data = await fetchAgents(workspaceId);
      if (outdated()) return;
      setAgents(data.agents ?? []);
      setTools(data.availableTools ?? []);
      setLoadError(null);
    } catch (e) {
      console.error("Failed to load agents:", e);
      if (outdated()) return;
      // fetch itself throws a TypeError when the web app can't be reached; anything else carries the server's message.
      setLoadError(
        e instanceof TypeError || !(e instanceof Error)
          ? NO_RESPONSE
          : `Couldn't load this workspace's agents. ${e.message}`
      );
    } finally {
      if (!outdated()) setLoading(false);
    }
  };

  useEffect(() => {
    // Never show (or let the user run and delete) another workspace's agents while the new ones load.
    setAgents([]);
    setTools([]);
    setLoadError(null);
    setFormOpen(false);
    setRunOpen(false);
    setDeleteOpen(false);
    loadAgents();
  }, [workspaceId]);

  const openCreate = () => {
    setFormAgent(null);
    setFormOpen(true);
  };
  const openEdit = (agent: Agent) => {
    setFormAgent(agent);
    setFormOpen(true);
  };
  const openRun = (agent: Agent) => {
    setRunAgent(agent);
    setRunOpen(true);
  };
  const openDelete = (agent: Agent) => {
    setDeleteAgent(agent);
    setDeleteOpen(true);
  };

  const handleSaved = (saved: Agent | null) => {
    // Show it straight away; the reload then brings in the server's own copy and counts.
    if (saved && saved.workspaceId === currentWorkspace.current) {
      setAgents((prev) =>
        prev.some((a) => a.id === saved.id) ? prev.map((a) => (a.id === saved.id ? saved : a)) : [...prev, saved]
      );
    }
    loadAgents(false);
  };

  const handleDeleted = (agentId: string) => {
    setAgents((prev) => prev.filter((a) => a.id !== agentId));
    setDeleteOpen(false);
    loadAgents(false);
  };

  const canCreate = !!workspaceId && tools.length > 0;

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
            Agents are helpers you set up for a particular job, each with its own instructions and tools.
          </p>
        </div>
        <Button
          onClick={openCreate}
          disabled={!canCreate}
          className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 rounded-lg"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          New agent
        </Button>
      </motion.div>

      {status && !status.agent && (
        <div role="alert" className="mx-6 mt-4 p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-sm text-red-400">
          The agent server isn&apos;t running, so no agents are available. Start it with <code className="font-mono">npm run dev</code>.
        </div>
      )}

      <div className="flex-1 px-6 pb-8 pt-4 space-y-8">
        {/* The agents the user set up */}
        <section aria-labelledby="your-agents">
          <h2 id="your-agents" className="text-base font-semibold text-foreground mb-3">
            Your agents
          </h2>

          {loadError && <LoadError message={loadError} onRetry={() => loadAgents()} className="mb-4" />}

          {loading ? (
            <div role="status" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <span className="sr-only">Loading agents…</span>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-52 rounded-xl" />
              ))}
            </div>
          ) : agents.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {agents.map((agent, index) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  tools={tools}
                  index={index}
                  onRun={openRun}
                  onEdit={openEdit}
                  onDelete={openDelete}
                />
              ))}
            </div>
          ) : (
            // After a failed load the list is unknown, so don't claim it is empty.
            !loadError && (
              <div className="bg-card/50 border border-dashed border-border rounded-xl p-10 text-center flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-muted-foreground">
                  <Bot className="w-6 h-6" aria-hidden="true" />
                </div>
                <h3 className="font-semibold text-foreground">No agents yet</h3>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Create an agent to give a particular job its own instructions and tools. You can run it here, pick it
                  in a chat, or use it in an automation.
                </p>
                <Button onClick={openCreate} disabled={!canCreate} className="mt-1 gap-1.5">
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  New agent
                </Button>
              </div>
            )
          )}
        </section>

        {/* The parts of Torvaix itself */}
        <BuiltInAgents workspaceId={workspaceId} />
      </div>

      {workspaceId && (
        <>
          <AgentFormDialog
            open={formOpen}
            agent={formAgent}
            availableTools={tools}
            workspaceId={workspaceId}
            onOpenChange={setFormOpen}
            onSaved={handleSaved}
          />
          <AgentRunDialog
            open={runOpen}
            agent={runAgent}
            availableTools={tools}
            workspaceId={workspaceId}
            onOpenChange={setRunOpen}
            onRunSettled={() => loadAgents(false)}
          />
          <DeleteAgentDialog
            open={deleteOpen}
            agent={deleteAgent}
            onOpenChange={setDeleteOpen}
            onDeleted={handleDeleted}
          />
        </>
      )}
    </div>
  );
}
