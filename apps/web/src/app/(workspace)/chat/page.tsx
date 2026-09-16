"use client"

import { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useChat } from "@ai-sdk/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Send, User, Loader2, Shield, Search, Database, BookOpen, GitCompare, Mail, CheckCircle2, Paperclip, BrainCircuit, Terminal, ChevronDown, ChevronRight, Activity, Clock, Cpu, HardDrive, ShieldCheck, Plus, Trash2, Square, AlertCircle, RotateCcw, Check, X } from "lucide-react";
import { useActiveWorkspace } from "@/hooks/use-active-workspace";
import { useSystemStatus } from "@/hooks/use-system-status";
import { useMemoryContextStore, type RetrievedMemory } from "@/store/memory-context-store";
import { useDBStore } from "@/store/db-store";
import {
  DEFAULT_CHAT_TITLE,
  formatAttachment,
  messagesSignature,
  pickActiveChat,
  stripActionMarker,
  toUiMessages,
} from "@/store/chat-history";
import { formatRelativeTime } from "@/lib/relative-time";
import { parseApprovalId } from "@/lib/approval";
import { ApprovalCard } from "@/components/chat/approval-card";
import { AppLogo } from "@/components/ui/app-logo";
import { MemoryModal } from "@/components/chat/memory-modal";
import { MarkdownMessage } from "@/components/chat/markdown";

const MAX_ATTACHMENT_BYTES = 100_000;
const TEXT_FILE = /\.(txt|md|markdown|json|csv|tsv|log|ya?ml|toml|ini|env|xml|html?|css|scss|js|jsx|mjs|cjs|ts|tsx|py|rb|go|rs|java|kt|c|h|cpp|hpp|cs|php|sh|bash|zsh|sql|swift|dart|vue|svelte)$/i;

/** Resolves the workspace's current chat (creating one if needed) and mounts a session for it. */
export default function ChatPage() {
  const { workspaceId } = useActiveWorkspace();
  const chats = useDBStore((s) => s.chats);
  const activeChatIds = useDBStore((s) => s.activeChatIds);
  const createChat = useDBStore((s) => s.createChat);
  const setActiveChat = useDBStore((s) => s.setActiveChat);
  const activeChat = workspaceId ? pickActiveChat(chats, workspaceId, activeChatIds[workspaceId]) : null;
  const creatingFor = useRef<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    if (activeChat) {
      creatingFor.current = null;
      return;
    }
    if (creatingFor.current === workspaceId) return; // StrictMode runs effects twice
    creatingFor.current = workspaceId;
    const chat = createChat(workspaceId, DEFAULT_CHAT_TITLE);
    setActiveChat(workspaceId, chat.id);
  }, [workspaceId, activeChat, createChat, setActiveChat]);

  if (!workspaceId || !activeChat) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Keyed by chat: switching chats or workspaces remounts useChat with that chat's own history,
  // so one conversation is never shown in (or sent as context to) another.
  return <ChatSession key={activeChat.id} chatId={activeChat.id} workspaceId={workspaceId} />;
}

function friendlyError(error: Error): string {
  try {
    const parsed = JSON.parse(error.message);
    if (parsed?.error) return String(parsed.error);
  } catch { /* plain message */ }
  return error.message || "Unknown error";
}

function ChatSession({ chatId, workspaceId }: { chatId: string; workspaceId: string }) {
  const systemStatus = useSystemStatus();
  const currentModel = systemStatus?.model?.id ?? (systemStatus ? 'unavailable' : '…');
  const provider = systemStatus?.model?.provider ?? 'ollama';
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processedPulseId = useRef<string | null>(null);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { workspace } = useActiveWorkspace();

  const allChats = useDBStore((s) => s.chats);
  const createChat = useDBStore((s) => s.createChat);
  const deleteChat = useDBStore((s) => s.deleteChat);
  const setActiveChat = useDBStore((s) => s.setActiveChat);
  const saveChatMessages = useDBStore((s) => s.saveChatMessages);
  const workspaceChats = useMemo(
    () =>
      allChats
        .filter((c) => c.workspaceId === workspaceId)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [allChats, workspaceId]
  );
  const currentChat = workspaceChats.find((c) => c.id === chatId);

  // Restore this chat's saved history once, when the session mounts.
  const [initialMessages] = useState(() => toUiMessages(useDBStore.getState().messages, chatId));

  const { messages, input, handleInputChange, handleSubmit, isLoading, setInput, append, data: streamData, error, reload, stop } = useChat({
    api: '/api/chat',
    id: chatId,
    initialMessages: initialMessages as any,
    keepLastMessageOnError: true,
    body: {
      model: currentModel,
      provider: provider,
      workspaceId,
    },
    onError: (err) => {
      console.error('[Torvaix Chat] Stream error:', err);
    },
  });

  // Persist the conversation to browser storage: the user's message right away, the reply once
  // it has finished streaming.
  const lastSaved = useRef(messagesSignature(initialMessages));
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (isLoading && last?.role !== 'user') return;
    const signature = messagesSignature(messages);
    if (signature === lastSaved.current) return;
    lastSaved.current = signature;
    saveChatMessages(chatId, messages);
  }, [messages, isLoading, chatId, saveChatMessages]);

  useEffect(() => {
    useMemoryContextStore.getState().resetKnowledgePulse();
  }, []);

  const startNewChat = () => {
    const chat = createChat(workspaceId, DEFAULT_CHAT_TITLE);
    setActiveChat(workspaceId, chat.id);
  };

  const deleteCurrentChat = () => {
    if (messages.length > 0 && !window.confirm(`Delete "${currentChat?.title ?? 'this chat'}"? This can't be undone.`)) return;
    if (isLoading) stop();
    deleteChat(chatId);
  };

  const resolveAction = async (pendingId: string, status: 'approved' | 'rejected'): Promise<boolean> => {
    setNotice(null);
    const res = await fetch('/api/agent/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pendingActionId: pendingId, status }),
    }).catch(() => null);
    if (!res?.ok) {
      const data = res ? await res.json().catch(() => ({})) : {};
      setNotice(
        data.error
          ? `Couldn't ${status === 'approved' ? 'approve' : 'deny'} the action: ${data.error}`
          : "Couldn't reach the agent server."
      );
      return false;
    }
    append({
      role: 'user',
      content: status === 'approved'
        ? `I have approved the action.\n__PENDING_ACTION_ID__:${pendingId}`
        : `I have denied the action. Please try a different approach.\n__PENDING_ACTION_ID__:${pendingId}`,
    });
    return true;
  };

  const attachFile = async (file: File) => {
    const isText = file.type.startsWith('text/') || /json|xml|javascript|typescript|yaml|x-sh/.test(file.type) || TEXT_FILE.test(file.name);
    if (!isText) {
      setNotice(`${file.name} can't be attached: only text and code files are supported.`);
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setNotice(`${file.name} is larger than 100 KB. Paste the relevant part instead.`);
      return;
    }
    const text = await file.text();
    setInput(`${input}${input ? '\n\n' : ''}${formatAttachment(file.name, text)}\n`);
    setNotice(null);
  };

  // --- Agent Trace State ---
  interface TraceEvent {
    phase: string;
    action: string;
    durationMs?: number;
    metadata?: Record<string, any>;
    timestamp: number;
  }
  interface TraceData {
    totalMs: number;
    events: TraceEvent[];
  }
  const [traceMap, setTraceMap] = useState<Map<number, TraceData>>(new Map());
  const [expandedTraces, setExpandedTraces] = useState<Set<number>>(new Set());

  const toggleTrace = (index: number) => {
    setExpandedTraces(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const phaseIcon = (phase: string) => {
    switch (phase) {
      case 'router': return <Cpu className="w-3.5 h-3.5 text-blue-400" />;
      case 'memory': return <HardDrive className="w-3.5 h-3.5 text-purple-400" />;
      case 'knowledge': return <Database className="w-3.5 h-3.5 text-green-400" />;
      case 'execution': return <Terminal className="w-3.5 h-3.5 text-amber-400" />;
      case 'approval': return <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />;
      case 'complete': return <CheckCircle2 className="w-3.5 h-3.5 text-primary" />;
      default: return <Activity className="w-3.5 h-3.5 text-muted-foreground" />;
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

    // Parse messages for tool results to update the right context panel
    const latestMessage = messages[messages.length - 1];
    if (latestMessage?.role === 'assistant' && latestMessage.toolInvocations) {
      const memoryQueries = latestMessage.toolInvocations.filter(t => t.toolName === 'query_memory' && t.state === 'result');

      if (memoryQueries.length > 0) {
        const latestQuery = memoryQueries[memoryQueries.length - 1];
        const queryResult = 'result' in latestQuery ? (latestQuery.result as { memories?: RetrievedMemory[] }) : undefined;
        if (queryResult && Array.isArray(queryResult.memories)) {
          useMemoryContextStore.getState().setRetrievedMemories(queryResult.memories);
        }
      }
    }
  }, [messages]);

  // Parse trace data from stream data annotations (prefix 2:)
  useEffect(() => {
    if (!streamData || !Array.isArray(streamData) || streamData.length === 0) return;
    const lastAssistantIdx = messages.length - 1;
    if (lastAssistantIdx < 0) return;

    for (const item of streamData) {
      try {
        const parsed = typeof item === 'string' ? JSON.parse(item) : item;

        // Agent trace annotation
        if (parsed.totalMs && parsed.events) {
          setTraceMap(prev => new Map(prev).set(lastAssistantIdx, parsed));
        }

        // Knowledge Pulse annotation — populate the side panel from the live agent run.
        // Deduped by id since `streamData` accumulates across turns.
        if (parsed.torvaixPulse && parsed.torvaixPulse.id !== processedPulseId.current) {
          processedPulseId.current = parsed.torvaixPulse.id;
          const pulse = parsed.torvaixPulse;
          const store = useMemoryContextStore.getState();
          store.setRetrievedMemories(pulse.retrievedMemories ?? []);
          store.setDetectedEntities(pulse.detectedEntities ?? []);
          store.setRelationships(pulse.relationships ?? []);
          store.setGraphActivity(pulse.graphActivity ?? { nodesAdded: 0, relationshipsAdded: 0, updated: false });
          store.setAgentSteps(pulse.agentSteps ?? []);
        }
      } catch { /* not structured data */ }
    }
  }, [streamData, messages]);

  const quickActions = [
    { icon: Terminal, text: "List files in directory", command: "ls -la" },
    { icon: Search, text: "Search Deep Web", command: "Search for latest AI news" },
    { icon: BookOpen, text: "Read Documentation", command: "Read the project documentation" },
    { icon: Database, text: "Query Memory", command: "Recall what we discussed about databases" },
    { icon: GitCompare, text: "Compare Models", command: "Compare local models vs cloud" },
    { icon: Mail, text: "Draft Email", command: "Draft a project update email" },
  ];

  const banner = notice ?? (error ? `Couldn't get a response: ${friendlyError(error)}` : null);

  return (
    <div className="flex-1 flex flex-col h-full bg-background relative overflow-hidden">
      {/* Header */}
      <motion.div
        className="flex items-center justify-between gap-3 p-4 border-b border-border bg-surface/80 backdrop-blur-sm z-10"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 shrink-0 bg-primary/10 border border-primary/20 text-primary rounded-lg flex items-center justify-center">
            <AppLogo size={16} animated={false} />
          </div>
          <div className="min-w-0">
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Switch chat"
                className="flex items-center gap-1.5 max-w-full outline-none border-none bg-transparent cursor-pointer rounded-md hover:text-primary transition-colors"
              >
                <h1 className="text-lg font-semibold text-foreground truncate">{currentChat?.title ?? DEFAULT_CHAT_TITLE}</h1>
                <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-72 max-h-96 overflow-y-auto bg-popover border-border">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Chats in {workspace?.name ?? 'this workspace'}</DropdownMenuLabel>
                  {workspaceChats.map((c) => (
                    <DropdownMenuItem
                      key={c.id}
                      onClick={() => {
                        if (c.id === chatId) return;
                        setActiveChat(workspaceId, c.id);
                        // Don't leave empty "New Chat" entries behind when switching away from one.
                        if (messages.length === 0) deleteChat(chatId);
                      }}
                      className="cursor-pointer flex items-center justify-between gap-3"
                    >
                      <span className="truncate">{c.title}</span>
                      <span className="flex items-center gap-1.5 shrink-0 text-[11px] text-muted-foreground">
                        {formatRelativeTime(c.updatedAt)}
                        {c.id === chatId && <Check className="w-3.5 h-3.5 text-primary" />}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <p className="text-xs text-muted-foreground truncate">Model: {currentModel} ({provider})</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex items-center gap-1 px-2 py-1 bg-green-500/10 border border-green-500/20 rounded-full">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-xs text-green-400">{provider === 'ollama' ? 'Local' : 'Cloud'}</span>
          </div>
          <div className="hidden md:flex items-center gap-1 px-2 py-1 bg-primary/10 border border-primary/20 rounded-full">
            <Shield className="w-3 h-3 text-primary" />
            <span className="text-xs text-primary">Private</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={startNewChat}
            disabled={messages.length === 0}
            className="gap-1.5 rounded-lg border-border"
            title={messages.length === 0 ? "This chat is already empty" : "Start a new chat"}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New chat</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={deleteCurrentChat}
            className="h-8 w-8 text-muted-foreground hover:text-red-400"
            aria-label="Delete this chat"
            title="Delete this chat"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </motion.div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <motion.div
            className="flex flex-col items-center justify-center h-full text-center px-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 20 }}
            transition={{ duration: 0.5 }}
          >
            <div className="w-20 h-20 bg-primary/10 border border-primary/20 text-primary rounded-2xl flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(0,212,170,0.15)]">
              <AppLogo size={40} animated={true} />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-4">Start Your AI Journey</h2>
            <p className="text-muted-foreground mb-8 max-w-md">
              I am your AI Operating System. I run locally and privately. How can I help you today?
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-w-3xl w-full">
              {quickActions.map((action, index) => (
                <motion.button
                  key={index}
                  className="flex items-center gap-3 p-4 bg-surface border border-border rounded-lg hover:bg-muted hover:border-primary/50 transition-all text-left group shadow-sm"
                  onClick={() => {
                    setInput(action.command);
                  }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  whileHover={{ scale: 1.02 }}
                >
                  <action.icon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  <span className="text-sm text-foreground transition-colors">
                    {action.text}
                  </span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        ) : (
          <AnimatePresence>
            {messages.map((message, index) => (
              <motion.div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                <div className={`max-w-[85%] md:max-w-2xl lg:max-w-3xl xl:max-w-4xl min-w-0 ${message.role === 'user' ? 'order-1' : 'order-2'}`}>
                  <div className={`flex items-start gap-3 ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm ${message.role === 'user'
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      : 'bg-primary/20 text-primary border border-primary/30'
                    }`}>
                      {message.role === 'user' ? ( <User className="w-4 h-4" /> ) : ( <AppLogo size={16} animated={false} /> )}
                    </div>

                    <div className={`rounded-2xl p-5 min-w-0 ${message.role === 'user'
                      ? 'bg-blue-500/10 border border-blue-500/20 text-foreground'
                      : 'bg-surface border border-border text-foreground'
                    } flex flex-col gap-4 w-full shadow-sm`}>

                      {/* Loading State for empty assistant message */}
                      {isLoading && message.role === 'assistant' && !message.content && (!message.toolInvocations || message.toolInvocations.length === 0) && index === messages.length - 1 && (
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <Loader2 className="w-4 h-4 text-primary animate-spin" />
                          <span className="text-sm font-medium animate-pulse text-primary">Thinking through your workspace...</span>
                        </div>
                      )}

                      {/* Tool Invocations Timeline */}
                      {message.toolInvocations && message.toolInvocations.length > 0 && (
                        <div className="flex flex-col gap-3 w-full font-mono text-sm">
                          {message.toolInvocations.map((tool) => (
                            <div key={tool.toolCallId} className="bg-background border border-border rounded-lg p-4 text-muted-foreground relative overflow-hidden">
                              <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary/50" />
                              <div className="flex items-center gap-2 mb-2">
                                {tool.state === 'result' ? (
                                  <CheckCircle2 className="w-4 h-4 text-primary" />
                                ) : (
                                  <Loader2 className="w-4 h-4 text-primary animate-spin" />
                                )}
                                <span className={tool.state === 'result' ? 'text-foreground font-semibold' : 'text-primary font-semibold'}>
                                  {tool.state === 'result' ? `Executed Agent Tool: ${tool.toolName}` : `Agent Running Tool: ${tool.toolName}`}
                                </span>
                              </div>
                              <div className="pl-6 pt-2 pb-1 overflow-x-auto whitespace-pre">
                                {tool.toolName === 'bash' ? `> ${tool.args?.command}` :
                                 tool.toolName === 'python' ? `> python script` :
                                 tool.toolName === 'read_file' ? `> cat ${tool.args?.filePath}` :
                                 tool.toolName === 'web_search' ? `> search "${tool.args?.query}"` :
                                 JSON.stringify(tool.args)}

                                {tool.state === 'result' && tool.result && tool.result.output && (
                                  <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
                                    {String(tool.result.output).substring(0, 500)}
                                    {String(tool.result.output).length > 500 && '... [output truncated]'}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Agent Trace Panel — Collapsed by default */}
                      {message.role === 'assistant' && traceMap.has(index) && (() => {
                        const trace = traceMap.get(index)!;
                        const isExpanded = expandedTraces.has(index);
                        return (
                          <div className="border border-border/50 rounded-lg overflow-hidden">
                            <button
                              onClick={() => toggleTrace(index)}
                              className="flex items-center justify-between w-full px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <Activity className="w-3.5 h-3.5 text-primary" />
                                <span className="font-medium">Agent Trace</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                                  {trace.totalMs.toFixed(0)}ms · {trace.events.length} steps
                                </span>
                              </div>
                              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            </button>
                            {isExpanded && (
                              <div className="px-3 pb-3 space-y-1.5 border-t border-border/30">
                                {trace.events.map((ev, i) => (
                                  <div key={i} className="flex items-center gap-2 text-[11px] py-1 px-2 rounded bg-background/50">
                                    {phaseIcon(ev.phase)}
                                    <span className="font-medium text-foreground/80 capitalize">{ev.phase}</span>
                                    <span className="text-muted-foreground">{ev.action}</span>
                                    {ev.durationMs !== undefined && (
                                      <span className="ml-auto flex items-center gap-1 text-muted-foreground">
                                        <Clock className="w-3 h-3" />
                                        {ev.durationMs.toFixed(0)}ms
                                      </span>
                                    )}
                                    {ev.metadata?.decision && (
                                      <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px]">
                                        → {ev.metadata.decision}
                                      </span>
                                    )}
                                    {ev.metadata?.hit !== undefined && (
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${ev.metadata.hit ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                                        {ev.metadata.hit ? `${ev.metadata.resultCount} hits` : 'miss'}
                                      </span>
                                    )}
                                    {ev.metadata?.tool && (
                                      <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[10px]">
                                        {ev.metadata.tool}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      {/* Text Content */}
                      {message.content && (() => {
                        const pendingId = message.role === 'assistant' ? parseApprovalId(message.content) : null;

                        if (pendingId && workspaceId) {
                          return (
                            <ApprovalCard
                              pendingId={pendingId}
                              workspaceId={workspaceId}
                              disabled={index < messages.length - 1 || isLoading}
                              onResolve={resolveAction}
                            />
                          );
                        }

                        if (message.role === 'assistant') {
                          return <MarkdownMessage content={message.content} />;
                        }

                        return (
                          <p className="text-[15px] whitespace-pre-wrap break-words leading-relaxed text-foreground/90">
                            {stripActionMarker(message.content)}
                          </p>
                        );
                      })()}

                    </div>
                  </div>
                </div>
              </motion.div>
            ))}

            {/* Standalone Thinking Bubble (when request is inflight but assistant message hasn't arrived) */}
            {isLoading && messages[messages.length - 1]?.role === 'user' && (
              <motion.div
                className="flex justify-start"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                <div className="max-w-xs md:max-w-2xl lg:max-w-3xl xl:max-w-4xl order-2">
                  <div className="flex items-start gap-3 flex-row">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm bg-primary/20 text-primary border border-primary/30">
                      <AppLogo size={16} animated={true} />
                    </div>

                    <div className="rounded-2xl p-5 bg-surface border border-border text-foreground flex flex-col gap-4 w-full shadow-sm">
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <Loader2 className="w-4 h-4 text-primary animate-spin" />
                          <span className="text-sm font-medium animate-pulse text-primary">Thinking through your workspace...</span>
                        </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <motion.div
        className="p-4 border-t border-border bg-surface/80 backdrop-blur-sm"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        {banner && (
          <div role="alert" className="max-w-4xl mx-auto mb-2 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1 min-w-0 break-words">{banner}</span>
            {!notice && error && (
              <Button type="button" size="sm" variant="ghost" onClick={() => reload()} className="h-7 gap-1.5 text-red-300 hover:text-red-200">
                <RotateCcw className="w-3.5 h-3.5" /> Retry
              </Button>
            )}
            {notice && (
              <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)} className="text-red-300 hover:text-red-200">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex flex-col gap-2">
          <div className="flex flex-col bg-background border border-border focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50 transition-all rounded-xl p-2 shadow-sm">
            <Textarea
              value={input}
              onChange={handleInputChange}
              placeholder="Ask Torvaix..."
              aria-label="Message"
              className="flex-1 min-h-[60px] max-h-48 resize-none bg-transparent border-none text-foreground placeholder:text-muted-foreground focus-visible:ring-0 px-2 py-2"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  if (input.trim() && !isLoading) handleSubmit(e as unknown as React.FormEvent<HTMLFormElement>);
                }
              }}
              disabled={isLoading}
            />

            {/* Input Toolbar */}
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50 px-1">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  title="Attach a text or code file"
                  aria-label="Attach a text or code file"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = ''; // allow re-attaching the same file
                    if (file) attachFile(file);
                  }}
                />

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setMemoryOpen(true)}
                  className="h-8 w-8 text-muted-foreground hover:text-purple-400 transition-colors"
                  title="Context & Memory"
                  aria-label="Context & Memory"
                >
                  <BrainCircuit className="h-4 w-4" />
                </Button>
              </div>

              {isLoading ? (
                <Button
                  type="button"
                  onClick={() => stop()}
                  size="sm"
                  variant="outline"
                  className="rounded-lg h-8 gap-1.5 border-border"
                  aria-label="Stop generating"
                >
                  <Square className="w-3.5 h-3.5 fill-current" /> Stop
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={!input.trim()}
                  size="sm"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg h-8 transition-all disabled:opacity-50"
                  aria-label="Send message"
                >
                  <Send className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 px-2 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-3 min-w-0">
              <span className="truncate">Model: <span className="text-foreground">{currentModel}</span></span>
              <span className="truncate">Workspace: <span className="text-foreground">{workspace?.name}</span></span>
            </div>
            <span className="hidden sm:inline shrink-0">Press Enter to send, Shift+Enter for new line</span>
          </div>
        </form>
      </motion.div>

      {/* Modals */}
      <MemoryModal open={memoryOpen} onOpenChange={setMemoryOpen} />
    </div>
  );
}
