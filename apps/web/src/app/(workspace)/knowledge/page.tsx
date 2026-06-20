"use client"

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Search, FileText, Tag, Clock, Brain, Plus, Filter, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";

interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  source: string;
  tags: string[];
  createdAt: string;
  type: "note" | "memory" | "document" | "snippet";
}

const SAMPLE_KNOWLEDGE: KnowledgeItem[] = [
  {
    id: "1",
    title: "Next.js App Router Patterns",
    content: "Server components are the default in App Router. Use 'use client' directive for interactive components. Layouts persist across navigations.",
    source: "Research Session",
    tags: ["next.js", "react", "architecture"],
    createdAt: "10 min ago",
    type: "note",
  },
  {
    id: "2",
    title: "Local LLM Deployment Guide",
    content: "Ollama supports llama3.2 with 4-bit quantization on M-series Macs. Memory requirements: ~4GB for 7B models, ~8GB for 13B.",
    source: "Chat Memory",
    tags: ["ollama", "deployment", "hardware"],
    createdAt: "1 hour ago",
    type: "memory",
  },
  {
    id: "3",
    title: "Vector Database Comparison",
    content: "Qdrant offers native gRPC support and filtering. Comparable to Pinecone for small-scale local deployments. Milvus is heavier but more feature-rich.",
    source: "Manual Entry",
    tags: ["database", "qdrant", "vectors"],
    createdAt: "Yesterday",
    type: "document",
  },
  {
    id: "4",
    title: "MCP Protocol Notes",
    content: "Model Context Protocol allows tools to be served over stdio or HTTP. Clients connect and discover tool schemas dynamically at runtime.",
    source: "Agent Discovery",
    tags: ["mcp", "protocol", "tools"],
    createdAt: "2 days ago",
    type: "snippet",
  },
];

const typeIcons: Record<string, React.ReactNode> = {
  note: <FileText className="w-4 h-4" />,
  memory: <Brain className="w-4 h-4" />,
  document: <BookOpen className="w-4 h-4" />,
  snippet: <Layers className="w-4 h-4" />,
};

const typeColors: Record<string, string> = {
  note: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  memory: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  document: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  snippet: "text-primary bg-primary/10 border-primary/20",
};

export default function KnowledgePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [items] = useState<KnowledgeItem[]>(SAMPLE_KNOWLEDGE);

  const filtered = items.filter(
    (item) =>
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Knowledge Base</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Everything Torvaix has learned — notes, memories, documents, and code snippets.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2 rounded-lg border-border text-muted-foreground hover:text-foreground">
            <Filter className="w-4 h-4" />
            Filter
          </Button>
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 rounded-lg">
            <Plus className="w-4 h-4" />
            Add Knowledge
          </Button>
        </div>
      </motion.div>

      {/* Search */}
      <div className="px-6 py-3">
        <div className="flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-2 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/30 transition-all">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search knowledge by title, content, or tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
      </div>

      {/* Knowledge Items */}
      <div className="flex-1 px-6 pb-6">
        <div className="flex flex-col gap-3">
          <AnimatePresence>
            {filtered.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ delay: index * 0.04, duration: 0.3 }}
                className="bg-surface border border-border rounded-xl p-5 hover:border-primary/30 transition-all duration-200 cursor-pointer group"
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className={`w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 ${typeColors[item.type]}`}>
                    {typeIcons[item.type]}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors truncate">
                        {item.title}
                      </h3>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border capitalize ${typeColors[item.type]}`}>
                        {item.type}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 mb-3">
                      {item.content}
                    </p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {item.tags.map((tag) => (
                          <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-mono">
                            {tag}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Tag className="w-3 h-3" />
                          {item.source}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {item.createdAt}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
