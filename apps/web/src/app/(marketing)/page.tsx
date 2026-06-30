"use client"

import { useState, useEffect, useRef } from "react"
import { motion, useInView, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { MessageSquare, Terminal, Mail, Search, GitCompare, Database, Sparkles, Shield, BookOpen, ExternalLink, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react"
import { HeroBackground } from "@/components/ui/hero-background"
import { AppLogo } from "@/components/ui/app-logo"

/* ── Inline GitHub SVG icon (not available in lucide-react) ── */
function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
    </svg>
  )
}

/* ── Feature card data ── */
const features = [
  {
    icon: <MessageSquare className="h-5 w-5 text-primary" />,
    title: "Chat & Agents",
    description: "Multi-turn chat plus autonomous agents that plan, call tools, and work through tasks."
  },
  {
    icon: <Terminal className="h-5 w-5 text-primary" />,
    title: "Tools & MCP",
    description: "Built-in tools (bash, files, web, memory) plus any MCP server you connect. Toggle per tool."
  },
  {
    icon: <BookOpen className="h-5 w-5 text-primary" />,
    title: "Cookbook",
    description: "Hardware-aware model recommendations and one-click serving across 270+ catalogued models."
  },
  {
    icon: <Mail className="h-5 w-5 text-primary" />,
    title: "Email Assistant",
    description: "AI summaries, style-matched draft replies, auto-tagging and spam triage over IMAP/SMTP."
  },
  {
    icon: <Search className="h-5 w-5 text-primary" />,
    title: "Deep Research",
    description: "Multi-step research runs that gather, read, and synthesize sources into a written report."
  },
  {
    icon: <GitCompare className="h-5 w-5 text-primary" />,
    title: "Compare",
    description: "Send one prompt to several models at once and compare their answers side-by-side."
  },
  {
    icon: <Database className="h-5 w-5 text-primary" />,
    title: "Memory",
    description: "Persistent memory the assistant builds up and recalls across all your conversations.",
    border: "border-primary/40 shadow-[0_0_20px_-5px_rgba(0,212,170,0.25)]"
  },
  {
    icon: <Sparkles className="h-5 w-5 text-primary" />,
    title: "Skills",
    badge: "self-evolving",
    description: "The assistant writes, refines, and reuses its own skills — getting more capable over time."
  },
  {
    icon: <Shield className="h-5 w-5 text-primary" />,
    title: "Private by default",
    description: "Runs on your machine against your own endpoints. No telemetry, with optional external integrations when you choose them.",
    border: "border-primary/40 shadow-[0_0_20px_-5px_rgba(0,212,170,0.25)]"
  }
]

/* ── Timeline / Story data ── */
const timeline = [
  {
    date: "2024",
    title: "The Idea",
    text: "Frustrated with cloud-locked AI tools that held our data hostage, we asked: what if everything ran on your own machine?"
  },
  {
    date: "Early 2025",
    title: "First Prototype",
    text: "A terminal-based chat that could talk to local Ollama models. No UI, no cloud — just raw prompts piped through a local daemon."
  },
  {
    date: "Mid 2025",
    title: "Workspace Vision",
    text: "Chat alone wasn't enough. We added tools, file access, memory, research, email — it became a full workspace."
  },
  {
    date: "2026",
    title: "Open Source Launch",
    text: "Torvaix ships publicly. Self-hosted, zero telemetry, runs offline. Your data never leaves your machine."
  }
]

/* ── Memory Log Fragments data ── */
const memoryLogs = [
  {
    id: "001",
    workspace: "Developer Workspace",
    quote: "I asked it to summarize my repo last week.\nToday it remembered everything.",
    metrics: { confidence: 98, nodes: 14, traces: 6 }
  },
  {
    id: "002",
    workspace: "Founder Workspace",
    quote: "Torvaix remembered my investor notes\nand turned them into a pitch strategy.",
    metrics: { confidence: 96, nodes: 11, traces: 4 }
  },
  {
    id: "003",
    workspace: "Research Workspace",
    quote: "It connected papers, experiments, and code\nwithout me re-explaining context.",
    metrics: { confidence: 99, nodes: 23, traces: 9 }
  },
  {
    id: "004",
    workspace: "Security Workspace",
    quote: "No cloud. No tracking.\nEverything stayed local.",
    metrics: { confidence: 100, nodes: 8, traces: 3 }
  },
  {
    id: "005",
    workspace: "Product Workspace",
    quote: "Torvaix converted conversations into tasks,\ntasks into execution, execution into memory.",
    metrics: { confidence: 97, nodes: 19, traces: 7 }
  }
]

/* ── Memory Log Carousel Component ── */
function MemoryLogCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const autoplayRef = useRef<NodeJS.Timeout | null>(null);

  const startAutoplay = () => {
    if (autoplayRef.current) clearInterval(autoplayRef.current);
    autoplayRef.current = setInterval(() => {
      if (!isPaused) {
        setDirection(1);
        setCurrentIndex((prev) => (prev + 1) % memoryLogs.length);
      }
    }, 6000);
  };

  useEffect(() => {
    startAutoplay();
    return () => {
      if (autoplayRef.current) clearInterval(autoplayRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPaused]);

  const navigate = (dir: number) => {
    setDirection(dir);
    setCurrentIndex((prev) => {
      const next = prev + dir;
      if (next < 0) return memoryLogs.length - 1;
      if (next >= memoryLogs.length) return 0;
      return next;
    });
    // Reset autoplay on manual interaction
    setIsPaused(true);
    setTimeout(() => setIsPaused(false), 10000);
  };

  const goToSlide = (idx: number) => {
    setDirection(idx > currentIndex ? 1 : -1);
    setCurrentIndex(idx);
    setIsPaused(true);
    setTimeout(() => setIsPaused(false), 10000);
  };

  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 300 : -300,
      opacity: 0,
      scale: 0.95,
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -300 : 300,
      opacity: 0,
      scale: 0.95,
    }),
  };

  const log = memoryLogs[currentIndex];

  return (
    <div className="relative max-w-3xl mx-auto">
      {/* Navigation Arrows */}
      <button
        onClick={() => navigate(-1)}
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 md:-translate-x-14 z-20 w-10 h-10 md:w-12 md:h-12 rounded-full bg-[#111827]/80 border border-white/10 flex items-center justify-center text-slate-400 hover:text-[#00D4AA] hover:border-[#00D4AA]/40 hover:shadow-[0_0_20px_rgba(0,212,170,0.15)] transition-all duration-300 backdrop-blur-sm"
        aria-label="Previous memory log"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button
        onClick={() => navigate(1)}
        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 md:translate-x-14 z-20 w-10 h-10 md:w-12 md:h-12 rounded-full bg-[#111827]/80 border border-white/10 flex items-center justify-center text-slate-400 hover:text-[#00D4AA] hover:border-[#00D4AA]/40 hover:shadow-[0_0_20px_rgba(0,212,170,0.15)] transition-all duration-300 backdrop-blur-sm"
        aria-label="Next memory log"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      {/* Card Container */}
      <div className="relative overflow-hidden rounded-2xl min-h-[340px] md:min-h-[320px]">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentIndex}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="bg-[#111827] border border-[#00D4AA]/20 rounded-2xl p-7 md:p-10 text-left relative overflow-hidden shadow-[0_0_40px_rgba(0,212,170,0.06),0_0_80px_rgba(0,212,170,0.03)]"
          >
            {/* Top glow line */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#00D4AA]/50 to-transparent" />
            
            {/* Scanline effect */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{
              backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,212,170,0.1) 2px, rgba(0,212,170,0.1) 4px)',
            }} />

            {/* Log Header */}
            <div className="font-mono text-xs text-[#00D4AA]/60 mb-5 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-[#00D4AA] animate-pulse" />
              <span>[Workspace Log #{log.id}]</span>
            </div>

            {/* Quote */}
            <div className="font-mono text-base md:text-lg text-slate-200 leading-relaxed mb-8 whitespace-pre-line">
              <span className="text-[#00D4AA]/50 mr-2">{'>'}</span>
              <span className="italic">&ldquo;{log.quote}&rdquo;</span>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-3 gap-4 font-mono text-xs border-t border-white/5 pt-5">
              <div>
                <div className="text-slate-500 mb-1">Memory Confidence</div>
                <div className="text-[#00D4AA] font-bold text-sm">
                  {log.metrics.confidence}%
                  <div className="mt-1.5 h-1 rounded-full bg-[#0B1020] overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${log.metrics.confidence}%` }}
                      transition={{ duration: 1, delay: 0.3, ease: "easeOut" }}
                      className="h-full rounded-full bg-gradient-to-r from-[#00D4AA] to-[#00D4AA]/60"
                    />
                  </div>
                </div>
              </div>
              <div>
                <div className="text-slate-500 mb-1">Knowledge Nodes</div>
                <div className="text-[#00D4AA] font-bold text-sm">{log.metrics.nodes}</div>
              </div>
              <div>
                <div className="text-slate-500 mb-1">Execution Traces</div>
                <div className="text-[#00D4AA] font-bold text-sm">{log.metrics.traces}</div>
              </div>
            </div>

            {/* Workspace Label */}
            <div className="mt-6 pt-4 border-t border-white/5 font-mono text-xs text-slate-500 flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-[#00D4AA]/40" />
              — {log.workspace}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Pagination Dots */}
      <div className="flex items-center justify-center gap-2.5 mt-8">
        {memoryLogs.map((_, idx) => (
          <button
            key={idx}
            onClick={() => goToSlide(idx)}
            className={`transition-all duration-300 rounded-full ${
              idx === currentIndex
                ? 'w-8 h-2 bg-[#00D4AA] shadow-[0_0_10px_rgba(0,212,170,0.4)]'
                : 'w-2 h-2 bg-slate-600 hover:bg-slate-400'
            }`}
            aria-label={`Go to memory log ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

function TypingEffect({ text }: { text: string }) {
  const [displayText, setDisplayText] = useState("");
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView) return;

    let index = 0;
    let isTyping = true;
    let timer: NodeJS.Timeout;

    const type = () => {
      if (!isTyping) return;
      if (index <= text.length) {
        setDisplayText(text.substring(0, index));
        index++;
        timer = setTimeout(type, 35);
      } else {
        timer = setTimeout(() => {
          if (!isTyping) return;
          setDisplayText("");
          index = 0;
          timer = setTimeout(type, 500);
        }, 3000);
      }
    };

    timer = setTimeout(type, 600);

    return () => {
      isTyping = false;
      clearTimeout(timer);
    };
  }, [text, isInView]);

  return (
    <span ref={ref}>
      {displayText}
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0] }}
        transition={{ repeat: Infinity, duration: 0.8 }}
        className="inline-block w-2 h-4 bg-[#00D4AA] align-middle ml-1"
      />
    </span>
  );
}

function AnimatedCodeBackground() {
  const codeSnippet = `import { Agent, Workspace } from '@torvaix/core';
import { LLMProvider } from '@torvaix/llm';

async function bootstrapTorvaix() {
  const workspace = new Workspace({ db: 'local-vector-store' });
  
  // Initialize local uncompromised LLM
  const model = await LLMProvider.load('llama-3-8b-instruct');
  workspace.attachModel(model);
  
  // Knowledge graph setup
  const memory = new VectorStore();
  await memory.indexDirectory('./knowledge');
  
  // Core event loop
  workspace.on('user_input', async (input) => {
    const context = await memory.search(input);
    const response = await model.generate(input, context);
    console.log(response);
  });
}

bootstrapTorvaix();`;

  const repeatedCode = Array(20).fill(codeSnippet).join('\n\n');

  return (
    <div className="absolute inset-0 overflow-hidden opacity-40 pointer-events-none select-none flex items-start justify-center">
      <motion.div
        animate={{ y: [0, -3000] }}
        transition={{ duration: 150, repeat: Infinity, ease: "linear" }}
        className="font-mono text-sm sm:text-base text-[#00D4AA]/80 whitespace-pre p-8 blur-[2px]"
      >
        {repeatedCode}
      </motion.div>
    </div>
  );
}

export default function LandingPage() {
  const [terminalState, setTerminalState] = useState<'open' | 'minimized' | 'closed'>('open');
  const [isCopied, setIsCopied] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30">
      
      {/* ════════════════════ NAVIGATION ════════════════════ */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-8 py-4 bg-background/90 backdrop-blur-md border-b border-border shadow-sm">
        <button onClick={() => window.scrollTo({top: 0, behavior: 'smooth'})} className="flex items-center gap-3 group focus:outline-none">
          <AppLogo size={28} animated={false} />
          <span className="text-2xl font-display font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-[#00D4AA] drop-shadow-sm">Torvaix</span>
        </button>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
          <Link href="#features" className="hover:text-foreground transition-colors duration-200">Features</Link>
          <Link href="#memory-fragments" className="hover:text-foreground transition-colors duration-200">Memory</Link>
          <Link href="#story" className="hover:text-foreground transition-colors duration-200">How it started</Link>
          <Link href="#install" className="hover:text-foreground transition-colors duration-200">Get started</Link>
        </div>
        <div className="hidden md:block">
          <a href="https://github.com/Yashasm18/Torvaix" target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="border-border bg-transparent hover:bg-muted text-foreground gap-2 rounded-full px-5 transition-all">
              <GithubIcon className="w-4 h-4" />
              GitHub
            </Button>
          </a>
        </div>
      </nav>

      {/* ════════════════════ TOP SECTION (HERO) ════════════════════ */}
      <div className="relative min-h-[90vh] flex flex-col overflow-hidden bg-background">
        
        {/* ══ Animated Interactive Canvas Background (Scoped to Hero) ══ */}
        <div className="absolute inset-0 z-0">
          <HeroBackground />
        </div>
        
        {/* Dot Matrix Grid (Scoped to Hero) */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-[0.03] z-0 dot-grid-animated"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, #ffffff 0.5px, transparent 0)',
            backgroundSize: '32px 32px'
          }}
        />

        {/* Smooth fade out at the bottom to blend seamlessly, no hard border */}
        <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-background via-background/80 to-transparent z-0 pointer-events-none" />

        {/* ════════════════════ HERO CONTENT ════════════════════ */}
        <main className="relative z-10 flex flex-col items-center justify-center flex-1 px-4 text-center py-32 md:py-48">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="flex flex-col items-center gap-6 md:gap-10"
          >
            {/* 1. App Logo & Subtitle (Odysseus Style) */}
            <div className="flex flex-col items-center gap-2 mb-4">
              <div className="flex items-center gap-3">
                <AppLogo size={42} animated={true} />
                <span className="text-5xl md:text-6xl font-display font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-cyan-300 via-[#00D4AA] to-blue-500 drop-shadow-[0_0_15px_rgba(0,212,170,0.4)]">Torvaix</span>
              </div>
              <div className="text-[14px] md:text-[15px] font-mono text-red-400/90 italic tracking-wide mt-1">
                Knowledge Operating System.
              </div>
            </div>

            {/* 2. Main Headline */}
            <h1 className="font-satoshi font-bold text-[clamp(44px,7vw,84px)] leading-[1.05] text-slate-100 max-w-[950px] mx-auto tracking-tight">
              Your own AI workspace,<br/>
              <span className="text-slate-300">that remembers.</span>
            </h1>

            {/* 3. Supporting Description */}
            <p className="font-sans text-[18px] md:text-[22px] font-normal leading-[1.7] text-slate-400 max-w-[850px] mx-auto">
              TORVAIX is a workspace where conversations become knowledge, knowledge becomes memory, and memory enables intelligent action. Chat with AI, organize projects, build knowledge, and work with autonomous agents—all in one connected system.
            </p>

            {/* 4. Philosophy Line */}
            <div className="mt-4 md:mt-8 font-mono text-[15px] md:text-[16px] font-medium tracking-[0.04em] text-slate-500">
              Memory-first. Local-first. Open source.
            </div>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-col sm:flex-row items-center gap-4 mt-8"
            >
              <Link href="#install">
                <Button className="bg-primary hover:bg-primary/90 text-primary-foreground border-0 rounded-xl px-8 py-6 text-lg font-semibold shadow-[0_0_25px_rgba(0,212,170,0.2)] transition-all hover:shadow-[0_0_35px_rgba(0,212,170,0.3)] hover:scale-[1.03] active:scale-[0.98] gap-2">
                  Get started
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
              <a href="https://github.com/Yashasm18/Torvaix" target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="bg-[#1F2937] border-white/10 hover:bg-[#2d333b] text-white rounded-xl px-8 py-6 text-lg font-semibold transition-all hover:border-white/20 gap-2 w-full sm:w-auto">
                  <GithubIcon className="w-5 h-5" />
                  View on GitHub
                </Button>
              </a>
            </motion.div>
          </motion.div>
      </main>
      </div>

      {/* ════════════════════ FEATURES GRID ════════════════════ */}
      <section id="features" className="relative z-10 py-32 px-4 border-t border-white/5 overflow-hidden bg-[#0B1020]">
        {/* Subtle dot matrix background to match screenshot */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-[0.15] z-0"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)',
            backgroundSize: '40px 40px'
          }}
        />
        
        <div className="max-w-6xl mx-auto text-center mb-16 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="flex items-center justify-center gap-2.5 mb-5"
          >
            <div className="grid grid-cols-2 gap-[3px]">
              <div className="w-1.5 h-1.5 bg-[#00D4AA] rounded-[2px]"/>
              <div className="w-1.5 h-1.5 bg-[#00D4AA] rounded-[2px]"/>
              <div className="w-1.5 h-1.5 bg-[#00D4AA] rounded-[2px]"/>
              <div className="w-1.5 h-1.5 bg-[#00D4AA] rounded-[2px]"/>
            </div>
            <span className="text-[#00D4AA] font-mono text-xs font-bold tracking-[0.2em] uppercase">Everything, Self-Hosted</span>
          </motion.div>
          <motion.h3 
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-3xl md:text-5xl font-bold text-slate-200 mb-5"
          >
            One app, a lot of capabilities
          </motion.h3>
          <motion.p 
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-slate-400 max-w-2xl mx-auto text-lg"
          >
            Started as an AI chat. Became a workspace. Each piece runs locally against whatever endpoints you point it at.
          </motion.p>
        </div>

        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
          {features.map((feature, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.07, duration: 0.5 }}
              className={`bg-[#111827]/80 backdrop-blur-xl border ${feature.border || 'border-white/[0.08]'} rounded-2xl p-8 text-left hover:border-[#00D4AA]/50 hover:shadow-[0_0_30px_-5px_rgba(0,212,170,0.15)] hover:-translate-y-1 transition-all duration-300 group cursor-default`}
            >
              <div className="w-12 h-12 rounded-xl bg-[#0B1020] border border-white/[0.08] flex items-center justify-center mb-6 group-hover:scale-110 group-hover:border-[#00D4AA]/40 group-hover:shadow-[0_0_15px_rgba(0,212,170,0.2)] transition-all duration-300">
                {feature.icon}
              </div>
              <h4 className="text-xl font-display font-bold text-slate-100 mb-3 flex items-center gap-3 tracking-wide">
                {feature.title}
                {feature.badge && (
                  <span className="text-[10px] font-mono text-[#00D4AA] border border-[#00D4AA]/30 bg-[#00D4AA]/10 px-2.5 py-0.5 rounded-full tracking-wider">
                    {feature.badge}
                  </span>
                )}
              </h4>
              <p className="text-[15px] font-sans text-slate-400 leading-relaxed group-hover:text-slate-300 transition-colors duration-300">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ════════════════════ LIVE MEMORY FRAGMENTS ════════════════════ */}
      <section id="memory-fragments" className="relative z-10 py-28 px-4 border-t border-white/5 overflow-hidden">
        {/* Background ambient glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-[#00D4AA]/[0.03] rounded-full blur-[120px] pointer-events-none" />
        
        <div className="max-w-6xl mx-auto text-center mb-16 relative z-10">
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex items-center justify-center gap-2.5 mb-5"
          >
            <Terminal className="w-4 h-4 text-[#00D4AA]" />
            <span className="text-[#00D4AA] font-mono text-xs font-bold tracking-[0.2em] uppercase">Live Memory Fragments</span>
          </motion.div>
          <motion.h3 
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-3xl md:text-5xl font-bold text-slate-200 mb-4"
          >
            What Torvaix remembers
          </motion.h3>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-slate-500 font-mono text-sm max-w-xl mx-auto"
          >
            Real workspace intelligence. Persistent context. Local execution.
          </motion.p>
        </div>

        <div className="relative z-10">
          <MemoryLogCarousel />
        </div>
      </section>

      {/* ════════════════════ HOW IT STARTED (STORY) ════════════════════ */}
      <section id="story" className="relative z-10 py-32 px-4 border-t border-white/5 overflow-hidden bg-[#0B1020]">
        
        {/* Animated coding background */}
        <AnimatedCodeBackground />
        
        {/* Subtle gradient overlay to fade edges, but leave code visible */}
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-[#0B1020] via-transparent to-[#0B1020] pointer-events-none" />

        <div className="max-w-4xl mx-auto relative z-10 flex flex-col gap-16">
          
          {/* New Why Torvaix Exists Box */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-[#111827]/80 backdrop-blur-md border border-white/10 rounded-2xl p-8 md:p-12 shadow-[0_0_50px_rgba(0,0,0,0.5)] relative overflow-hidden"
          >
            {/* Subtle glow inside the box */}
            <div className="absolute top-0 left-1/4 w-1/2 h-px bg-gradient-to-r from-transparent via-[#00D4AA]/50 to-transparent"></div>

            <div className="flex items-center gap-2 mb-8">
               <span className="text-[#00D4AA] font-mono text-xs font-bold tracking-[0.2em]">◎ WHY TORVAIX EXISTS</span>
            </div>
            
            <div className="space-y-6 text-slate-300 text-left leading-relaxed text-[15px] sm:text-base font-mono">
              <p>I built Torvaix because using AI felt fragmented.</p>
              <p>Every model had its own interface. Conversations lived in one place, notes in another, and knowledge was scattered across countless tabs and applications.</p>
              <p>The models were getting smarter, but the workflow around them wasn&apos;t.</p>
              <p>Torvaix began as an attempt to bring everything together: conversations, knowledge, documents, and multiple AI models inside a single workspace.</p>
              <p>The goal isn&apos;t just to chat with AI. It&apos;s to build a system that remembers, organizes, and helps turn information into knowledge.</p>
              <p>Whether your models run locally or in the cloud, Torvaix gives them a shared home — without locking you into a single provider.</p>
            </div>
          </motion.div>

          {/* Existing Terminal Box */}
          <div className="text-center pt-8 border-t border-white/5">
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="flex items-center justify-center gap-2.5 mb-5"
            >
              <BookOpen className="w-4 h-4 text-[#00D4AA]" />
              <span className="text-[#00D4AA] font-mono text-xs font-bold tracking-[0.2em] uppercase">Origin Story</span>
            </motion.div>
            
            <motion.h3 
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-lg md:text-xl font-mono text-slate-300 max-w-2xl mx-auto mb-8"
            >
              Torvaix was created by a carefully crafted one-shot AI prompt:
            </motion.h3>

            {terminalState === 'closed' ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="max-w-3xl mx-auto flex justify-center py-4"
              >
                <button 
                  onClick={() => setTerminalState('open')}
                  className="border border-dashed border-slate-500/50 text-slate-400 hover:text-slate-200 hover:border-slate-400 rounded-full px-6 py-2.5 flex items-center gap-3 font-mono text-sm transition-all shadow-lg bg-[#0d1117]/50 backdrop-blur-sm"
                >
                  <span className="text-lg leading-none mb-[2px]">×</span> reopen terminal
                </button>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                layout
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className={`mx-auto shadow-2xl text-left overflow-hidden bg-[#0d1117] border border-white/10 ${
                  terminalState === 'minimized' ? 'max-w-[400px] rounded-full' : 'max-w-3xl rounded-xl'
                }`}
              >
                {/* Terminal Header */}
                <div className={`flex items-center justify-between px-5 py-3.5 bg-[#111827] ${terminalState === 'minimized' ? '' : 'border-b border-white/10'}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 font-mono text-[13px] md:text-sm">user@torvaix: ~</span>
                  </div>
                  <div className="flex items-center gap-4 text-slate-500 font-mono">
                    <button 
                      onClick={() => setTerminalState(terminalState === 'open' ? 'minimized' : 'open')} 
                      className="hover:text-slate-200 transition-colors px-2 py-1 -my-1 rounded-md"
                    >
                      —
                    </button>
                    <button 
                      onClick={() => setTerminalState('closed')} 
                      className="hover:text-slate-200 transition-colors px-2 py-1 -my-1 rounded-md text-lg leading-none"
                    >
                      ×
                    </button>
                  </div>
                </div>
                
                {/* Terminal Body */}
                {terminalState === 'open' && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="p-6 font-mono text-sm leading-relaxed text-[#00D4AA]"
                  >
                    <span className="text-[#98c379] font-bold mr-2">{'>'}</span>
                    <TypingEffect text="Create an AI workspace because I'm tired of opening 17 tabs, forgetting everything I learned yesterday, and pretending my notes system is organized." />
                  </motion.div>
                )}
              </motion.div>
            )}
          </div>
        </div>
      </section>

      {/* ════════════════════ CTA / INSTALL SECTION ════════════════════ */}
      <section id="install" className="relative z-10 py-32 px-4 border-t border-white/5 bg-[#20242D]" style={{
        backgroundImage: 'radial-gradient(circle at center, rgba(255,255,255,0.06) 1px, transparent 1px)',
        backgroundSize: '32px 32px'
      }}>
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="max-w-4xl mx-auto rounded-[2rem] bg-[#11161d] p-8 md:p-14 text-center shadow-2xl border border-white/5 relative overflow-hidden"
        >
          {/* Subtle glow effect behind */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-32 bg-[#fca5a5]/5 blur-[80px] pointer-events-none" />

          <div className="text-[#fca5a5] font-mono text-xs md:text-sm tracking-[0.2em] font-bold mb-6 flex items-center justify-center gap-2">
            <span>{'>_'}</span> GET STARTED
          </div>
          
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold text-slate-100 mb-6 tracking-tight">
            Torvaix is yours.
          </h2>
          
          <p className="text-xl md:text-2xl text-slate-300 mb-4 max-w-3xl mx-auto font-sans leading-relaxed font-medium">
            Open-source. Local-first. Memory-native. No telemetry, no lock-in, no forgetting.
          </p>

          <p className="text-sm md:text-base text-slate-500 mb-8 max-w-2xl mx-auto font-sans leading-relaxed">
            Run your own models, own your memory, and work with intelligent agents inside a connected knowledge workspace.
          </p>

          {/* Prerequisites */}
          <div className="flex flex-col items-center mb-8">
            <span className="text-[10px] text-slate-500 font-mono mb-3 uppercase tracking-[0.15em]">Bring your own stack</span>
            <div className="flex flex-wrap justify-center gap-2">
              {['Node.js 20+', 'Ollama', 'Docker'].map(req => (
                <span key={req} className="px-3 py-1.5 bg-[#0d1117] border border-white/5 rounded-md text-xs font-mono text-slate-400">
                  {req}
                </span>
              ))}
            </div>
          </div>

          <div className="relative bg-[#0d1117] border border-white/10 rounded-xl p-5 md:p-6 mb-10 text-left font-mono text-sm overflow-x-auto mx-auto max-w-3xl flex items-start justify-between group shadow-inner">
            <div className="text-slate-300 pr-24 whitespace-pre font-jetbrains leading-[1.8] flex flex-col gap-1">
              <div><span className="text-[#fca5a5]">$</span> git clone https://github.com/Yashasm18/Torvaix.git</div>
              <div><span className="text-[#fca5a5]">$</span> cd Torvaix</div>
              <div><span className="text-[#fca5a5]">$</span> npm install</div>
              <div><span className="text-[#fca5a5]">$</span> docker compose up -d</div>
              <div><span className="text-[#fca5a5]">$</span> ollama serve</div>
              <div><span className="text-[#fca5a5]">$</span> npm run dev</div>
            </div>
            <button 
              onClick={() => {
                navigator.clipboard.writeText("git clone https://github.com/Yashasm18/Torvaix.git\ncd Torvaix\nnpm install\ndocker compose up -d\nollama serve\nnpm run dev");
                setIsCopied(true);
                setTimeout(() => setIsCopied(false), 2000);
              }}
              className={`absolute top-4 right-4 md:top-6 md:right-6 border rounded-md px-4 py-2 text-xs transition-all duration-300 ${
                isCopied 
                  ? 'bg-[#00D4AA]/10 border-[#00D4AA]/50 text-[#00D4AA] shadow-[0_0_15px_rgba(0,212,170,0.4)]' 
                  : 'bg-white/5 hover:bg-white/10 text-slate-400 border-white/20 hover:text-white'
              }`}
            >
              {isCopied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          <a href="https://github.com/Yashasm18/Torvaix" target="_blank" rel="noopener noreferrer" className="inline-block mb-2">
            <Button className="bg-[#fca5a5] hover:bg-[#fca5a5]/90 text-[#11161d] border-0 rounded-lg px-8 py-6 text-base font-bold transition-all shadow-lg hover:-translate-y-0.5">
              View on GitHub
            </Button>
          </a>

          <div className="flex flex-wrap justify-center gap-3 mt-12">
            {['Open Source', 'Local-First', 'Memory-Powered', 'Multi-Model', 'Agentic', 'Privacy-First'].map(badge => (
              <span key={badge} className="px-4 py-1.5 rounded-full border border-white/10 text-slate-400 text-xs font-mono bg-white/5 hover:bg-white/10 hover:text-slate-300 transition-colors cursor-default">
                {badge}
              </span>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ════════════════════ FOOTER ════════════════════ */}
      <footer className="relative z-10 border-t border-white/5 py-12 px-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <AppLogo size={20} animated={false} />
            <span className="text-sm font-semibold text-slate-400">&copy; {new Date().getFullYear()} Torvaix</span>
            <span className="text-xs text-slate-600 font-mono">v0.1.0</span>
          </div>

          <div className="flex flex-col md:items-end gap-2 text-xs text-slate-600 font-mono">
            <p>No tokens were wasted in the making of this workspace.*</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
