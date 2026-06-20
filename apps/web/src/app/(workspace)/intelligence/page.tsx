"use client"

import { useState } from "react";
import { motion } from "framer-motion";
import { Cpu, Server, HardDrive, Activity, Gauge, Download, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ModelInfo {
  id: string;
  name: string;
  provider: "ollama" | "cloud" | "custom";
  size: string;
  status: "loaded" | "available" | "downloading";
  quantization: string;
  context: string;
  lastUsed: string;
}

const MODELS: ModelInfo[] = [
  {
    id: "llama3.2",
    name: "Llama 3.2",
    provider: "ollama",
    size: "2.0 GB",
    status: "loaded",
    quantization: "Q4_K_M",
    context: "128K",
    lastUsed: "Active",
  },
  {
    id: "nomic-embed",
    name: "Nomic Embed Text",
    provider: "ollama",
    size: "274 MB",
    status: "loaded",
    quantization: "FP16",
    context: "8K",
    lastUsed: "Active (embeddings)",
  },
  {
    id: "codellama",
    name: "Code Llama",
    provider: "ollama",
    size: "3.8 GB",
    status: "available",
    quantization: "Q4_K_M",
    context: "16K",
    lastUsed: "2 days ago",
  },
  {
    id: "mistral",
    name: "Mistral 7B",
    provider: "ollama",
    size: "4.1 GB",
    status: "available",
    quantization: "Q4_0",
    context: "32K",
    lastUsed: "1 week ago",
  },
];

const statusColors: Record<string, { dot: string; text: string; label: string }> = {
  loaded: { dot: "bg-green-500 animate-pulse", text: "text-green-400", label: "Loaded" },
  available: { dot: "bg-slate-500", text: "text-muted-foreground", label: "Available" },
  downloading: { dot: "bg-blue-500 animate-pulse", text: "text-blue-400", label: "Downloading" },
};

export default function IntelligencePage() {
  const [models] = useState<ModelInfo[]>(MODELS);

  const loadedCount = models.filter((m) => m.status === "loaded").length;

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
            Manage local models, providers, and AI capabilities powering your workspace.
          </p>
        </div>
        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 rounded-lg">
          <Download className="w-4 h-4" />
          Pull Model
        </Button>
      </motion.div>

      {/* Stats Row */}
      <div className="px-6 pt-4 pb-2">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Models Loaded", value: loadedCount.toString(), icon: Cpu, color: "text-green-400" },
            { label: "Total Available", value: models.length.toString(), icon: Server, color: "text-blue-400" },
            { label: "VRAM Usage", value: "~4.2 GB", icon: HardDrive, color: "text-amber-400" },
            { label: "Inference", value: "Local", icon: Wifi, color: "text-primary" },
          ].map((stat, idx) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05, duration: 0.3 }}
              className="bg-surface border border-border rounded-lg p-4 flex items-center gap-3"
            >
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <div>
                <div className="text-lg font-bold text-foreground font-mono">{stat.value}</div>
                <div className="text-[11px] text-muted-foreground">{stat.label}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Models List */}
      <div className="flex-1 px-6 pb-6 pt-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Model Registry</span>
        </div>
        <div className="flex flex-col gap-3">
          {models.map((model, index) => {
            const status = statusColors[model.status];
            return (
              <motion.div
                key={model.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, duration: 0.3 }}
                className="bg-surface border border-border rounded-xl px-5 py-4 hover:border-primary/30 transition-all duration-200 group"
              >
                <div className="flex items-center gap-4">
                  {/* Icon */}
                  <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                    <Cpu className="w-5 h-5" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm text-foreground">{model.name}</h3>
                      <div className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                      <span className={`text-xs font-mono ${status.text}`}>{status.label}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground font-mono">
                      <span>{model.size}</span>
                      <span className="text-border">|</span>
                      <span>{model.quantization}</span>
                      <span className="text-border">|</span>
                      <span>ctx: {model.context}</span>
                      <span className="text-border">|</span>
                      <span>{model.lastUsed}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {model.status === "available" && (
                      <Button variant="outline" size="sm" className="text-xs gap-1.5 rounded-lg border-border">
                        <RefreshCw className="w-3 h-3" />
                        Load
                      </Button>
                    )}
                    {model.status === "loaded" && (
                      <div className="flex items-center gap-1 px-2 py-1 bg-green-500/10 border border-green-500/20 rounded-full">
                        <Activity className="w-3 h-3 text-green-500" />
                        <span className="text-[10px] text-green-400 font-mono">Active</span>
                      </div>
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
