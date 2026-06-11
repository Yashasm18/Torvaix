"use client"

import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { MessageSquare, Terminal, Mail, Search, GitCompare, Database, Sparkles, Shield, BookOpen, Quote, ArrowRight, ExternalLink } from "lucide-react"
import { HeroBackground } from "@/components/ui/hero-background"

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
    icon: <MessageSquare className="h-5 w-5 text-[#e06c75]" />,
    title: "Chat & Agents",
    description: "Multi-turn chat plus autonomous agents that plan, call tools, and work through tasks."
  },
  {
    icon: <Terminal className="h-5 w-5 text-[#e06c75]" />,
    title: "Tools & MCP",
    description: "Built-in tools (bash, files, web, memory) plus any MCP server you connect. Toggle per tool."
  },
  {
    icon: <BookOpen className="h-5 w-5 text-[#e06c75]" />,
    title: "Cookbook",
    description: "Hardware-aware model recommendations and one-click serving across 270+ catalogued models."
  },
  {
    icon: <Mail className="h-5 w-5 text-[#e06c75]" />,
    title: "Email Assistant",
    description: "AI summaries, style-matched draft replies, auto-tagging and spam triage over IMAP/SMTP."
  },
  {
    icon: <Search className="h-5 w-5 text-[#e06c75]" />,
    title: "Deep Research",
    description: "Multi-step research runs that gather, read, and synthesize sources into a written report."
  },
  {
    icon: <GitCompare className="h-5 w-5 text-[#e06c75]" />,
    title: "Compare",
    description: "Send one prompt to several models at once and compare their answers side-by-side."
  },
  {
    icon: <Database className="h-5 w-5 text-[#e06c75]" />,
    title: "Memory",
    description: "Persistent memory the assistant builds up and recalls across all your conversations.",
    border: "border-[#e06c75]/40 shadow-[0_0_20px_-5px_rgba(224,108,117,0.25)]"
  },
  {
    icon: <Sparkles className="h-5 w-5 text-[#e06c75]" />,
    title: "Skills",
    badge: "self-evolving",
    description: "The assistant writes, refines, and reuses its own skills — getting more capable over time."
  },
  {
    icon: <Shield className="h-5 w-5 text-[#e06c75]" />,
    title: "Private by default",
    description: "Runs on your machine against your own endpoints. No telemetry, with optional external integrations when you choose them.",
    border: "border-[#e06c75]/40 shadow-[0_0_20px_-5px_rgba(224,108,117,0.25)]"
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

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#1c2128] text-slate-300 font-sans selection:bg-[#e06c75]/30">
      
      {/* ════════════════════ TOP SECTION (NAV + HERO) ════════════════════ */}
      <div className="relative min-h-[90vh] flex flex-col overflow-hidden border-b border-white/5">
        
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
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#1c2128] to-transparent z-0 pointer-events-none" />

        {/* ════════════════════ NAVIGATION ════════════════════ */}
        <nav className="relative z-50 flex items-center justify-between px-8 py-4 bg-transparent">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-7 h-7 bg-[#e06c75] rounded-md transform rotate-45 flex items-center justify-center transition-transform group-hover:rotate-[405deg] duration-500">
              <div className="w-3.5 h-3.5 bg-[#1c2128] transform -rotate-45 rounded-sm" />
            </div>
            <span className="text-xl font-bold tracking-tight text-white">Torvaix</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
            <Link href="#features" className="hover:text-white transition-colors duration-200">Features</Link>
            <Link href="#testimonials" className="hover:text-white transition-colors duration-200">Testimonials</Link>
            <Link href="#story" className="hover:text-white transition-colors duration-200">How it started</Link>
            <Link href="/app" className="hover:text-white transition-colors duration-200">Get started</Link>
          </div>
          <div>
            <Button variant="outline" className="border-white/10 bg-transparent hover:bg-white/5 text-slate-300 gap-2 rounded-full px-5 transition-all">
              <GithubIcon className="w-4 h-4" />
              GitHub
            </Button>
          </div>
        </nav>

        {/* ════════════════════ HERO CONTENT ════════════════════ */}
        <main className="relative z-10 flex flex-col items-center justify-center flex-1 px-4 text-center pb-20">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="flex flex-col items-center"
          >
            <div className="w-14 h-14 bg-[#e06c75] rounded-xl transform rotate-45 flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(224,108,117,0.4)]">
              <div className="w-7 h-7 bg-[#1c2128] transform -rotate-45 rounded-md" />
            </div>
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-white mb-2">Torvaix</h1>
            <p className="text-[#e06c75] font-mono text-sm tracking-[0.25em] uppercase mb-14 opacity-80">Yours for the voyage.</p>
          </motion.div>

          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="text-5xl md:text-7xl font-extrabold tracking-tight text-slate-200 max-w-4xl leading-[1.08] mb-10"
          >
            Your own <span className="text-[#e06c75]">AI</span> workspace,<br/>running on your hardware.
          </motion.h2>

          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-6 leading-relaxed"
          >
          Torvaix is a self-hosted interface for talking to language models — chat, autonomous agents, tools, model serving, email, research, and more. Local-first, privacy-first, and no telemetry. Just you and your <span className="text-[#e06c75]">models</span>.
        </motion.p>
        
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.45 }}
          className="text-sm text-slate-500 mb-14 font-mono italic"
        >
          (if you want to add an API that&apos;s cool too — I&apos;m not here to tell you how to live your life...)
        </motion.p>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-col sm:flex-row items-center gap-4"
        >
          <Link href="/app">
            <Button className="bg-[#e06c75] hover:bg-[#d95861] text-white border-0 rounded-xl px-8 py-6 text-lg font-semibold shadow-[0_0_25px_rgba(224,108,117,0.35)] transition-all hover:shadow-[0_0_35px_rgba(224,108,117,0.5)] hover:scale-[1.03] active:scale-[0.98]">
              Get started
            </Button>
          </Link>
          <Button variant="outline" className="bg-[#22272e] border-white/10 hover:bg-[#2d333b] text-white rounded-xl px-8 py-6 text-lg font-semibold transition-all hover:border-white/20 gap-2">
            <GithubIcon className="w-5 h-5" />
            View on GitHub
          </Button>
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
              <div className="w-1.5 h-1.5 bg-[#e06c75] rounded-[2px]"/>
              <div className="w-1.5 h-1.5 bg-[#e06c75] rounded-[2px]"/>
              <div className="w-1.5 h-1.5 bg-[#e06c75] rounded-[2px]"/>
              <div className="w-1.5 h-1.5 bg-[#e06c75] rounded-[2px]"/>
            </div>
            <span className="text-[#e06c75] font-mono text-xs font-bold tracking-[0.2em] uppercase">Everything, Self-Hosted</span>
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
              className={`bg-[#22272e]/80 backdrop-blur-sm border ${feature.border || 'border-white/[0.06]'} rounded-2xl p-7 text-left hover:border-[#e06c75]/40 transition-all duration-300 group cursor-default`}
            >
              <div className="w-12 h-12 rounded-xl bg-[#1c2128] border border-white/[0.06] flex items-center justify-center mb-5 group-hover:scale-110 group-hover:border-[#e06c75]/20 transition-all duration-300">
                {feature.icon}
              </div>
              <h4 className="text-lg font-bold text-slate-200 mb-2.5 flex items-center gap-3">
                {feature.title}
                {feature.badge && (
                  <span className="text-[10px] font-mono text-[#e06c75] border border-[#e06c75]/30 bg-[#e06c75]/10 px-2.5 py-0.5 rounded-full tracking-wider">
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
            <Quote className="w-4 h-4 text-[#e06c75]" />
            <span className="text-[#e06c75] font-mono text-xs font-bold tracking-[0.2em] uppercase">What people say</span>
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
              className="bg-[#22272e]/80 backdrop-blur-sm border border-white/[0.06] rounded-2xl p-7 text-left hover:border-[#e06c75]/30 transition-all duration-300 flex flex-col"
            >
              <Quote className="w-6 h-6 text-[#e06c75]/30 mb-4 shrink-0" />
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
      <section id="story" className="relative z-10 py-28 px-4 border-t border-white/5">
        <div className="max-w-4xl mx-auto text-center mb-16">
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex items-center justify-center gap-2.5 mb-5"
          >
            <BookOpen className="w-4 h-4 text-[#e06c75]" />
            <span className="text-[#e06c75] font-mono text-xs font-bold tracking-[0.2em] uppercase">Origin Story</span>
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
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#161b22]">
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-mono text-xs">user@torvaix: ~</span>
              </div>
              <div className="flex items-center gap-2 text-slate-500">
                <span className="w-3 h-3 rounded-full bg-slate-700"></span>
                <span className="w-3 h-3 rounded-full bg-slate-700"></span>
              </div>
            </div>
            
            {/* Terminal Body */}
            <div className="p-6 font-mono text-sm leading-relaxed text-[#56b6c2]">
              <span className="text-[#98c379] font-bold mr-2">{'>'}</span>
              I was free , learning nothing from college sat down in silence thought of ai , i prompted my idea the result was right in front of me
            </div>
          </motion.div>
        </div>
      </section>

      {/* ════════════════════ CTA ════════════════════ */}
      <section className="relative z-10 py-28 px-4 border-t border-white/5">
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
            <Link href="/app">
              <Button className="bg-[#e06c75] hover:bg-[#d95861] text-white border-0 rounded-xl px-8 py-6 text-lg font-semibold shadow-[0_0_25px_rgba(224,108,117,0.35)] transition-all hover:shadow-[0_0_35px_rgba(224,108,117,0.5)] hover:scale-[1.03] gap-2">
                Get started <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <Button variant="outline" className="bg-[#22272e] border-white/10 hover:bg-[#2d333b] text-white rounded-xl px-8 py-6 text-lg font-semibold transition-all hover:border-white/20 gap-2">
              <GithubIcon className="w-5 h-5" />
              Star on GitHub
            </Button>
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
              <div className="w-3 h-3 rounded-full bg-[#e06c75]/60" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
              <div className="w-3 h-3 rounded-full bg-green-500/60" />
            </div>
            <p className="text-slate-500">$ <span className="text-slate-300">git clone https://github.com/torvaix/torvaix.git</span></p>
            <p className="text-slate-500">$ <span className="text-slate-300">cd torvaix && npm install</span></p>
            <p className="text-slate-500">$ <span className="text-slate-300">npm run dev</span></p>
            <p className="text-green-400/80 mt-2">✓ Torvaix running at http://localhost:3000</p>
          </motion.div>
        </div>
      </section>

      {/* ════════════════════ FOOTER ════════════════════ */}
      <footer className="relative z-10 border-t border-white/5 py-12 px-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 bg-[#e06c75] rounded-sm transform rotate-45 flex items-center justify-center">
              <div className="w-2.5 h-2.5 bg-[#1c2128] transform -rotate-45 rounded-sm" />
            </div>
            <span className="text-sm font-semibold text-slate-400">Torvaix</span>
            <span className="text-xs text-slate-600 font-mono">v0.1.0</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-slate-500">
            <Link href="#features" className="hover:text-slate-300 transition-colors">Features</Link>
            <Link href="#story" className="hover:text-slate-300 transition-colors">Story</Link>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 transition-colors flex items-center gap-1">
              GitHub <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <p className="text-xs text-slate-600 font-mono">
            Open source · No telemetry · Your data, your machine
          </p>
        </div>
      </footer>
    </div>
  )
}
