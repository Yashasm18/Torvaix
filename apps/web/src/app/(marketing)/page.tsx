"use client"

import { useState, useEffect, useRef } from "react"
import { motion, useInView } from "framer-motion"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { MessageSquare, Terminal, Mail, Search, GitCompare, Database, Sparkles, Shield, BookOpen, Quote, ExternalLink, ArrowRight } from "lucide-react"
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

/* ── Testimonials data ── */
const testimonials = [
  {
    quote: "I deleted three SaaS subscriptions the week I installed Torvaix. Everything I need runs on my M2 now.",
    author: "Alex K.",
    role: "Independent Developer"
  },
  {
    quote: "The privacy angle isn't theoretical — I watched the network tab. Zero outbound requests when running local models. This is real.",
    author: "Priya S.",
    role: "Security Researcher"
  },
  {
    quote: "Skills that self-evolve are wild. I asked it to research a topic and it built itself a web-scraping pipeline I didn't even know it could do.",
    author: "Marcus T.",
    role: "Data Scientist"
  }
]

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
  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30">
      
      {/* ════════════════════ NAVIGATION ════════════════════ */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-8 py-4 bg-background/90 backdrop-blur-md border-b border-border shadow-sm">
        <Link href="/" className="flex items-center gap-3 group">
          <AppLogo size={28} animated={false} />
          <span className="text-xl font-bold tracking-tight text-foreground">TORVAIX</span>
        </Link>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
          <Link href="#features" className="hover:text-foreground transition-colors duration-200">Features</Link>
          <Link href="#testimonials" className="hover:text-foreground transition-colors duration-200">Testimonials</Link>
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
      <div className="relative min-h-[90vh] flex flex-col overflow-hidden border-b border-border bg-background">
        
        {/* ══ Animated Interactive Canvas Background (Scoped to Hero) ══ */}
        <HeroBackground />
        
        {/* Dot Matrix Grid (Scoped to Hero) */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-[0.04] z-0 dot-grid-animated"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, #ffffff 0.5px, transparent 0)',
            backgroundSize: '32px 32px'
          }}
        />

        {/* Subtle fade out at the bottom of the hero to blend into the rest of the page */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent z-0 pointer-events-none" />

        {/* ════════════════════ HERO CONTENT ════════════════════ */}
        <main className="relative z-10 flex flex-col items-center justify-center flex-1 px-4 text-center pb-20 pt-16">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="flex flex-col items-center"
          >
            <div className="mb-6 drop-shadow-[0_0_40px_rgba(0,212,170,0.2)]">
              <AppLogo size={56} animated={true} />
            </div>
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-foreground mb-12">TORVAIX</h1>
          </motion.div>

          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="text-5xl md:text-7xl font-extrabold tracking-tight text-foreground max-w-4xl leading-[1.08] mb-10"
          >
            One Workspace.<br/>
            <span className="text-primary">Every Model.</span>
          </motion.h2>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-14 leading-relaxed flex flex-col gap-2"
          >
            <p>Conversations become knowledge.</p>
            <p>Knowledge becomes memory.</p>
            <p>Memory enables intelligent action.</p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center gap-4"
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
      </main>
      </div>

      {/* ════════════════════ FEATURES ════════════════════ */}
      <section id="features" className="relative z-10 py-28 px-4 border-t border-white/5">
        <div className="max-w-6xl mx-auto text-center mb-16">
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

        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((feature, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.07, duration: 0.5 }}
              className={`bg-[#1F2937]/80 backdrop-blur-sm border ${feature.border || 'border-white/[0.06]'} rounded-2xl p-7 text-left hover:border-[#00D4AA]/40 transition-all duration-300 group cursor-default`}
            >
              <div className="w-12 h-12 rounded-xl bg-[#0B1020] border border-white/[0.06] flex items-center justify-center mb-5 group-hover:scale-110 group-hover:border-[#00D4AA]/20 transition-all duration-300">
                {feature.icon}
              </div>
              <h4 className="text-lg font-bold text-slate-200 mb-2.5 flex items-center gap-3">
                {feature.title}
                {feature.badge && (
                  <span className="text-[10px] font-mono text-[#00D4AA] border border-[#00D4AA]/30 bg-[#00D4AA]/10 px-2.5 py-0.5 rounded-full tracking-wider">
                    {feature.badge}
                  </span>
                )}
              </h4>
              <p className="text-sm text-slate-400 leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ════════════════════ TESTIMONIALS ════════════════════ */}
      <section id="testimonials" className="relative z-10 py-28 px-4 border-t border-white/5">
        <div className="max-w-6xl mx-auto text-center mb-16">
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex items-center justify-center gap-2.5 mb-5"
          >
            <Quote className="w-4 h-4 text-[#00D4AA]" />
            <span className="text-[#00D4AA] font-mono text-xs font-bold tracking-[0.2em] uppercase">What people say</span>
          </motion.div>
          <motion.h3 
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-3xl md:text-5xl font-bold text-slate-200 mb-5"
          >
            Built for people who care about privacy
          </motion.h3>
        </div>

        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1, duration: 0.5 }}
              className="bg-[#1F2937]/80 backdrop-blur-sm border border-white/[0.06] rounded-2xl p-7 text-left hover:border-[#00D4AA]/30 transition-all duration-300 flex flex-col"
            >
              <Quote className="w-6 h-6 text-[#00D4AA]/30 mb-4 shrink-0" />
              <p className="text-slate-300 leading-relaxed mb-6 flex-1 italic">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="border-t border-white/5 pt-4">
                <p className="font-semibold text-slate-200 text-sm">{t.author}</p>
                <p className="text-xs text-slate-500">{t.role}</p>
              </div>
            </motion.div>
          ))}
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
              <p>I built TORVAIX because using AI felt fragmented.</p>
              <p>Every model had its own interface. Conversations lived in one place, notes in another, and knowledge was scattered across countless tabs and applications.</p>
              <p>The models were getting smarter, but the workflow around them wasn&apos;t.</p>
              <p>TORVAIX began as an attempt to bring everything together: conversations, knowledge, documents, and multiple AI models inside a single workspace.</p>
              <p>The goal isn&apos;t just to chat with AI. It&apos;s to build a system that remembers, organizes, and helps turn information into knowledge.</p>
              <p>Whether your models run locally or in the cloud, TORVAIX gives them a shared home — without locking you into a single provider.</p>
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

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="bg-[#0d1117] border border-white/10 rounded-xl overflow-hidden max-w-3xl mx-auto shadow-2xl text-left"
            >
              {/* Terminal Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#111827]">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-mono text-xs">user@torvaix: ~</span>
                </div>
                <div className="flex items-center gap-2 text-slate-500">
                  <span className="w-3 h-3 rounded-full bg-slate-700"></span>
                  <span className="w-3 h-3 rounded-full bg-slate-700"></span>
                </div>
              </div>
              
              {/* Terminal Body */}
              <div className="p-6 font-mono text-sm leading-relaxed text-[#00D4AA]">
                <span className="text-[#98c379] font-bold mr-2">{'>'}</span>
                <TypingEffect text="I was free , learning nothing from college sat down in silence thought of ai , i prompted my idea the result was right in front of me" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ════════════════════ CTA / INSTALL SECTION ════════════════════ */}
      <section id="install" className="relative z-10 py-28 px-4 border-t border-white/5">
        <div className="max-w-3xl mx-auto text-center">
          <motion.h3
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl md:text-5xl font-bold text-slate-200 mb-6"
          >
            Ready to own your AI?
          </motion.h3>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-lg text-slate-400 mb-10 max-w-xl mx-auto"
          >
            One command to install. Zero data leaves your machine. Start building with your own models today.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            {/* Remove the secondary "Get started" button here since we are already at the Get Started section */}
            <a href="https://github.com/Yashasm18/Torvaix" target="_blank" rel="noopener noreferrer">
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground border-0 rounded-xl px-8 py-6 text-lg font-semibold shadow-[0_0_25px_rgba(0,212,170,0.2)] transition-all hover:shadow-[0_0_35px_rgba(0,212,170,0.3)] hover:scale-[1.03] gap-2 w-full sm:w-auto">
                <GithubIcon className="w-5 h-5" />
                View on GitHub
              </Button>
            </a>
          </motion.div>

          {/* Terminal Install Block */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="mt-12 bg-[#0d1117] border border-white/[0.06] rounded-xl p-5 max-w-md mx-auto text-left font-mono text-sm"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-3 h-3 rounded-full bg-[#00D4AA]/60" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
              <div className="w-3 h-3 rounded-full bg-green-500/60" />
            </div>
            <p className="text-slate-500">$ <span className="text-slate-300">git clone https://github.com/Yashasm18/Torvaix.git</span></p>
            <p className="text-slate-500">$ <span className="text-slate-300">cd torvaix && npm install</span></p>
            <p className="text-slate-500">$ <span className="text-slate-300">npm run dev</span></p>
            <p className="text-green-400/80 mt-2">✓ Torvaix running at http://localhost:3000</p>
            <p className="text-slate-500 mt-2">$ <span className="text-slate-300">Visit http://localhost:3000/chat to start</span></p>
          </motion.div>
        </div>
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
