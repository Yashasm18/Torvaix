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
import { Send, User, Loader2, Shield, Search, Database, BookOpen, CheckCircle2, Paperclip, BrainCircuit, Terminal, ChevronDown, Cpu, Plus, Trash2, Square, AlertCircle, RotateCcw, Check, X } from "lucide-react";
import { useActiveWorkspace } from "@/hooks/use-active-workspace";
import { chatModelState } from '@/lib/model-status';
import { useSystemStatus } from "@/hooks/use-system-status";
import { useAnswerDetailsStore } from "@/store/answer-details-store";
import { normalizeTurn } from "@/lib/answer-details";
import { selectChatAgentId, useDBStore } from "@/store/db-store";
import {
  DEFAULT_CHAT_TITLE,
  formatAttachment,
  messagesSignature,
  pickActiveChat,
  stripActionMarker,
  toUiMessages,
} from "@/store/chat-history";
import { formatRelativeTime } from "@/lib/relative-time";

/** Marks the message that carries an approval or a denial back to the agent. */
const ACTION_MARKER = "__PENDING_ACTION_ID__";

/** A finished tool call whose result is a failure. */
function toolFailed(tool: { state: string; result?: { output?: unknown } }): boolean {
  return tool.state === "result" && String(tool.result?.output ?? "").startsWith("Tool execution failed");
}
import { parseApprovalId } from "@/lib/approval";
import { ApprovalCard } from "@/components/chat/approval-card";
import { AgentPicker, REMEMBERED_AGENT_NAME, agentLabel, useWorkspaceAgents } from "@/components/chat/agent-picker";
import { AppLogo } from "@/components/ui/app-logo";
import { MemoryModal } from "@/components/chat/memory-modal";
import { ApprovalModePicker, useApprovalMode } from "@/components/chat/approval-mode-picker";
import { ThinkingIndicator } from "@/components/chat/thinking-indicator";
import { latestProgress } from "@/lib/progress";
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
  const modelState = chatModelState(systemStatus);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Each reply's details go to exactly one message. Stream data piles up across turns, so
  // without this the previous reply's details would be pinned to the next message too.
  const attachedTurnIds = useRef(new Set<string>());
  const turnsByMessage = useAnswerDetailsStore((s) => s.byMessage);
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

  // Who answers this chat. A remembered agent is sent as it is while the list is still loading or
  // failed to load: dropping it then would quietly use the normal assistant, which has more tools
  // than the agent that was picked, and a wrong id is turned down by the server ("Unknown agent").
  // Only a list that loaded and lacks the agent (deleted) makes it fall back, in the effect below.
  const { agents, status: agentsStatus, reload: reloadAgents } = useWorkspaceAgents(workspaceId);
  const rememberedAgentId = useDBStore((s) => selectChatAgentId(s, chatId));
  const setChatAgent = useDBStore((s) => s.setChatAgent);
  const activeAgent = agents.find((a) => a.id === rememberedAgentId) ?? null;
  const agentGone = rememberedAgentId !== null && agentsStatus === 'ready' && !activeAgent;
  const agentId = agentGone ? undefined : (rememberedAgentId ?? undefined);
  const agentName = agentLabel(agents, agentsStatus, rememberedAgentId);

  useEffect(() => {
    if (agentGone) setChatAgent(chatId, null);
  }, [agentGone, chatId, setChatAgent]);

  // Restore this chat's saved history once, when the session mounts.
  const [initialMessages] = useState(() => toUiMessages(useDBStore.getState().messages, chatId));

  const approvalMode = useApprovalMode();

  const { messages, input, handleInputChange, handleSubmit, isLoading, setInput, append, data: streamData, error, reload, stop } = useChat({
    api: '/api/chat',
    id: chatId,
    initialMessages: initialMessages as any,
    keepLastMessageOnError: true,
    // useChat (0.0.70) re-reads `body` on every request, so this is the agent at the moment of
    // sending, including for the message that resumes after an approval.
    body: {
      model: currentModel,
      provider: provider,
      workspaceId,
      agentId,
      approvalMode,
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
    useAnswerDetailsStore.getState().reset();
  }, []);

  // The agent server turned the request down because the agent is gone (deleted in another tab).
  // Look again, so the stale choice is dropped and Retry goes to the normal assistant.
  useEffect(() => {
    if (error && /unknown agent/i.test(friendlyError(error))) reloadAgents();
  }, [error]);

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
  // What the agent says it is doing, while the newest reply is still being worked out.
  const progressSteps = useMemo(() => latestProgress(streamData), [streamData]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Read the "How I answered" details from the stream's data parts (prefix 2:)
  useEffect(() => {
    if (!streamData || !Array.isArray(streamData) || streamData.length === 0) return;
    if (messages.length === 0) return;

    for (const item of streamData) {
      try {
        const parsed = typeof item === 'string' ? JSON.parse(item) : item;

        // "How I answered" details for this reply.
        const turn = normalizeTurn(parsed.torvaixPulse);
        if (turn && !attachedTurnIds.current.has(turn.id)) {
          const store = useAnswerDetailsStore.getState();
          if (store.latest?.id !== turn.id) store.record(turn);
          // The details arrive just before the reply's text, so its message may not exist yet;
          // this effect runs again when it does.
          const last = messages[messages.length - 1];
          if (last?.role === 'assistant') {
            attachedTurnIds.current.add(turn.id);
            store.attach(last.id, turn);
          }
        }
      } catch { /* not structured data */ }
    }
  }, [streamData, messages]);

  const messageBox = useRef<HTMLTextAreaElement>(null);

  const quickActions = [
    // Each of these is something Torvaix can actually do, phrased so the router sends it to
    // the right place. "Remember that " is left open for the user to finish.
    { icon: Database, text: "Remember a fact", hint: "Saved to this workspace", command: "Remember that " },
    { icon: BrainCircuit, text: "What do you remember?", hint: "Recall saved memories", command: "What do you remember about me?" },
    { icon: Search, text: "Search the web", hint: "Live results", command: "Search the web for the latest news about local AI models" },
    { icon: Terminal, text: "List workspace files", hint: "Runs after you approve", command: "List the files in this workspace folder" },
    { icon: BookOpen, text: "Create a file", hint: "Written to the workspace", command: "Create a file named notes.md with a short to-do list" },
    { icon: Cpu, text: "Summarise this repo", hint: "Scans the workspace folder", command: "Scan this repo and summarise its structure" },
  ];

  const banner = notice ?? (error ? `Couldn't get a response: ${friendlyError(error)}` : null);

  return (
    <div className="flex-1 flex flex-col h-full bg-background relative overflow-hidden">
      {/* Header */}
      <motion.div
        className="@container flex items-center justify-between gap-3 p-4 border-b border-border bg-surface/80 backdrop-blur-sm z-10"
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
          <AgentPicker
            agents={agents}
            status={agentsStatus}
            value={rememberedAgentId}
            onChange={(id) => setChatAgent(chatId, id)}
            onRetry={reloadAgents}
            disabled={isLoading}
          />
          {/* Sized by the header's own width: with both side panels open the window can be wide and the header narrow. */}
          {modelState.ready === false ? (
            <div className="hidden @2xl:flex items-center gap-1 px-2 py-1 bg-red-500/10 border border-red-500/20 rounded-full" title={modelState.problem ?? undefined}>
              <div className="w-2 h-2 bg-red-500 rounded-full" />
              <span className="text-xs text-red-400">Model offline</span>
            </div>
          ) : (
            <div className="hidden @2xl:flex items-center gap-1 px-2 py-1 bg-green-500/10 border border-green-500/20 rounded-full" title={modelState.local ? "The model runs on this computer" : "The model runs at a cloud provider"}>
              <div className="w-2 h-2 bg-green-500 rounded-full" />
              <span className="text-xs text-green-400">{modelState.local ? 'Local' : 'Cloud'}</span>
            </div>
          )}
          {/* Only true for a local model: with a cloud model, prompts go to that provider. */}
          {modelState.local && (
            <div className="hidden @3xl:flex items-center gap-1 px-2 py-1 bg-primary/10 border border-primary/20 rounded-full" title="Prompts stay on this computer">
              <Shield className="w-3 h-3 text-primary" />
              <span className="text-xs text-primary">Private</span>
            </div>
          )}
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
            <span className="hidden @xl:inline">New chat</span>
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
            <h2 className="text-2xl font-bold text-foreground mb-3">What can I help with?</h2>
            <p className="text-muted-foreground mb-8 max-w-md">
              Ask a question, or pick a starting point. Anything you ask me to remember stays in this workspace.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-w-3xl w-full">
              {quickActions.map((action, index) => (
                <motion.button
                  key={index}
                  className="flex items-center gap-3 p-4 bg-surface border border-border rounded-lg hover:bg-muted hover:border-primary/50 transition-all text-left group shadow-sm"
                  onClick={() => {
                    setInput(action.command);
                    // Put the cursor in the box so the prompt can be sent or finished straight away.
                    requestAnimationFrame(() => {
                      const box = messageBox.current;
                      if (!box) return;
                      box.focus();
                      box.setSelectionRange(action.command.length, action.command.length);
                    });
                  }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  whileHover={{ scale: 1.02 }}
                >
                  <action.icon className="w-5 h-5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">{action.text}</span>
                    <span className="block text-xs text-muted-foreground truncate">{action.hint}</span>
                  </span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        ) : (
          <AnimatePresence>
            {messages.map((message, index) => (
              // The message that carries an approval back to the agent is plumbing, not something the user said.
              message.role === 'user' && message.content.includes(ACTION_MARKER) ? null :
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

                      {/* Tool Invocations Timeline */}
                      {message.toolInvocations && message.toolInvocations.length > 0 && (
                        <div className="flex flex-col gap-3 w-full font-mono text-sm">
                          {message.toolInvocations.map((tool) => (
                            <div key={tool.toolCallId} className="bg-background border border-border rounded-lg p-4 text-muted-foreground relative overflow-hidden">
                              <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary/50" />
                              <div className="flex items-center gap-2 mb-2">
                                {tool.state === 'result' ? (
                                  toolFailed(tool) ? <AlertCircle className="w-4 h-4 text-red-400" /> : <CheckCircle2 className="w-4 h-4 text-primary" />
                                ) : (
                                  <Loader2 className="w-4 h-4 text-primary animate-spin" />
                                )}
                                <span className={tool.state === 'result' ? 'text-foreground font-semibold' : 'text-primary font-semibold'}>
                                  {tool.state !== 'result' ? `Running ${tool.toolName}` : toolFailed(tool) ? `${tool.toolName} failed` : `Ran ${tool.toolName}`}
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

                      {/* Still working: shown under any finished tool cards, so it stays in view */}
                      {isLoading && message.role === 'assistant' && !message.content && index === messages.length - 1 && (
                        <ThinkingIndicator steps={progressSteps} />
                      )}

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
                          // When the reply is just the command's output again, the card above already shows it.
                          const repeatsOutput = (message.toolInvocations ?? []).some(
                            (tool) => tool.state === 'result' && String(tool.result?.output ?? '').trim() === message.content.trim()
                          );
                          return (
                            <>
                              {!repeatsOutput && <MarkdownMessage content={message.content} />}
                              {turnsByMessage[message.id] && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const store = useAnswerDetailsStore.getState();
                                    store.select(message.id);
                                    store.requestOpen();
                                  }}
                                  className="self-start text-xs text-muted-foreground hover:text-primary transition-colors"
                                >
                                  How I answered
                                </button>
                              )}
                            </>
                          );
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
                        <ThinkingIndicator steps={progressSteps} />
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
        {modelState.problem && (
          <div role="status" className="max-w-4xl mx-auto mb-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-300">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="min-w-0 break-words">{modelState.problem}</span>
          </div>
        )}
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto flex flex-col gap-2">
          <div className="flex flex-col bg-background border border-border focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50 transition-all rounded-xl p-2 shadow-sm">
            <Textarea
              value={input}
              onChange={handleInputChange}
              placeholder={`Ask ${agentName === REMEMBERED_AGENT_NAME ? 'your agent' : agentName}...`}
              aria-label="Message"
              ref={messageBox}
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
                <ApprovalModePicker disabled={isLoading} />
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
              <span className="truncate">Agent: <span className="text-foreground">{agentName}</span></span>
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
