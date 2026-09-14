"use client"

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Cpu, Server, HardDrive, Activity, RefreshCw, Wifi, WifiOff, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSystemStatus } from "@/hooks/use-system-status";
import { formatRelativeTime } from "@/lib/relative-time";

interface OllamaModel {
  name: string;
  size: number;
  modifiedAt: string | null;
  family: string | null;
  parameterSize: string | null;
  quantization: string | null;
  loaded: boolean;
  sizeVram: number;
}

interface ModelsResponse {
  reachable: boolean;
  ollamaUrl: string;
  models: OllamaModel[];
  error?: string;
}

const EMBED_MODEL = "nomic-embed-text";

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i >= 3 ? 1 : 0)} ${units[i]}`;
}

/** Ollama treats `name` and `name:latest` as the same model. */
function sameModel(a: string, b: string) {
  const norm = (s: string) => (s.includes(":") ? s : `${s}:latest`);
  return norm(a) === norm(b);
}

export default function IntelligencePage() {
  const status = useSystemStatus();
  const [data, setData] = useState<ModelsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/system/models", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      setData(body);
      setError(null);
    } catch (e: any) {
      setError(e.message || "Failed to load models");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const models = data?.models ?? [];
  const chatModel = status?.model;
  const loadedModels = models.filter((m) => m.loaded);
  const vram = loadedModels.reduce((sum, m) => sum + m.sizeVram, 0);
  const chatIsLocal = chatModel?.provider === "ollama";
  const missing = data?.reachable
    ? [
        ...(chatModel && chatIsLocal && !models.some((m) => sameModel(m.name, chatModel.id)) ? [chatModel.id] : []),
        ...(!models.some((m) => sameModel(m.name, EMBED_MODEL)) ? [EMBED_MODEL] : []),
      ]
    : [];

  const stats = [
    { label: "Installed", value: data?.reachable ? models.length.toString() : "—", icon: Server, color: "text-blue-400" },
    { label: "Loaded in memory", value: data?.reachable ? loadedModels.length.toString() : "—", icon: Cpu, color: "text-green-400" },
    { label: "Memory in use", value: data?.reachable ? formatBytes(vram) : "—", icon: HardDrive, color: "text-amber-400" },
    {
      label: "Chat model",
      value: chatModel?.id ?? "—",
      icon: chatIsLocal ? Wifi : chatModel ? Activity : WifiOff,
      color: "text-primary",
    },
  ];

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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Intelligence</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Local models installed in Ollama and the model powering your workspace.
          </p>
        </div>
        <Button onClick={load} disabled={loading} variant="outline" className="gap-2 rounded-lg border-border">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </Button>
      </motion.div>

      {/* Stats Row */}
      <div className="px-6 pt-4 pb-2">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.map((stat, idx) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05, duration: 0.3 }}
              className="bg-surface border border-border rounded-lg p-4 flex items-center gap-3 min-w-0"
            >
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <div className="min-w-0">
                <div className="text-lg font-bold text-foreground font-mono truncate">{stat.value}</div>
                <div className="text-[11px] text-muted-foreground">{stat.label}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="flex-1 px-6 pb-6 pt-4 space-y-4">
        {error && (
          <div className="flex items-center gap-2 p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-sm text-red-400">
            <WifiOff className="w-4 h-4 shrink-0" /> Couldn&apos;t reach the agent server. Is it running on port 3001?
          </div>
        )}

        {data && !data.reachable && (
          <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-sm">
            <WifiOff className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <div className="text-foreground">Ollama isn&apos;t reachable at <code className="font-mono">{data.ollamaUrl}</code></div>
              <div className="text-muted-foreground mt-1">Start it with <code className="font-mono">ollama serve</code>, or set <code className="font-mono">OLLAMA_URL</code> for the agent server.</div>
            </div>
          </div>
        )}

        {missing.length > 0 && (
          <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="text-foreground">Required model{missing.length > 1 ? "s" : ""} not installed</div>
              {missing.map((name) => (
                <code key={name} className="block font-mono text-xs text-muted-foreground mt-1">ollama pull {name}</code>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Installed Models</span>
        </div>

        {data?.reachable && models.length === 0 && (
          <p className="text-sm text-muted-foreground">No models pulled yet. Run <code className="font-mono">ollama pull llama3.2</code> to get started.</p>
        )}

        <div className="flex flex-col gap-3">
          {models.map((model, index) => {
            const isChat = !!chatModel && chatIsLocal && sameModel(model.name, chatModel.id);
            const isEmbed = sameModel(model.name, EMBED_MODEL);
            return (
              <motion.div
                key={model.name}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03, duration: 0.3 }}
                className="bg-surface border border-border rounded-xl px-5 py-4 hover:border-primary/30 transition-all duration-200"
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                    <Cpu className="w-5 h-5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm text-foreground font-mono">{model.name}</h3>
                      {isChat && <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">Chat model</span>}
                      {isEmbed && <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">Embeddings</span>}
                    </div>
                    <div className="flex items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground font-mono flex-wrap">
                      <span>{formatBytes(model.size)}</span>
                      {model.parameterSize && <><span className="text-border">|</span><span>{model.parameterSize}</span></>}
                      {model.quantization && <><span className="text-border">|</span><span>{model.quantization}</span></>}
                      {model.modifiedAt && <><span className="text-border">|</span><span>pulled {formatRelativeTime(model.modifiedAt)}</span></>}
                    </div>
                  </div>

                  <div className="shrink-0">
                    {model.loaded ? (
                      <div className="flex items-center gap-1 px-2 py-1 bg-green-500/10 border border-green-500/20 rounded-full">
                        <Activity className="w-3 h-3 text-green-500" />
                        <span className="text-[10px] text-green-400 font-mono">Loaded · {formatBytes(model.sizeVram)}</span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground font-mono">Idle</span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
