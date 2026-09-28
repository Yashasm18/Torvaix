"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { BrainCircuit, CheckCircle2, Database, ShieldCheck, Terminal, Zap } from "lucide-react"

/**
 * Illustrative workspace stories for the landing page. The people are personas, not customers:
 * every story only describes things Torvaix actually does (memory recall, repo scans, approval
 * before commands, automations), and the section says so.
 */

type TraceStep = { phase: string; detail: string; ms?: number; tone?: "ok" | "warn" }

interface Story {
  id: string
  name: string
  role: string
  workspace: string
  accent: string
  quote: string
  trace: TraceStep[]
  recalled: string[]
  graph: { center: string; nodes: string[] }
}

const STORIES: Story[] = [
  {
    id: "aarav",
    name: "Aarav",
    role: "Backend developer",
    workspace: "payments-api",
    accent: "#00D4AA",
    quote: "I had it scan my repo on Monday. On Friday I asked where auth lives, and it just knew.",
    trace: [
      { phase: "router", detail: "memory recall", ms: 4 },
      { phase: "memory", detail: "3 memories recalled", ms: 38 },
      { phase: "conversation", detail: "answer with context", ms: 812 },
    ],
    recalled: ["Auth lives in services/identity", "Monorepo uses pnpm workspaces", "Deploys run on GitHub Actions"],
    graph: { center: "payments-api", nodes: ["identity", "pnpm", "Postgres", "Actions"] },
  },
  {
    id: "maya",
    name: "Maya",
    role: "Startup founder",
    workspace: "seed-round",
    accent: "#A78BFA",
    quote: "A month of investor call notes went in. Now I just ask what each fund pushed back on.",
    trace: [
      { phase: "router", detail: "memory recall", ms: 3 },
      { phase: "memory", detail: "keyword + vector search", ms: 52 },
      { phase: "conversation", detail: "summary per fund", ms: 1240 },
    ],
    recalled: ["Fund A worried about churn", "Fund B wants a US entity", "Demo day is on 14 October"],
    graph: { center: "Seed round", nodes: ["Fund A", "Fund B", "churn", "US entity"] },
  },
  {
    id: "lena",
    name: "Lena",
    role: "ML researcher",
    workspace: "thesis",
    accent: "#38BDF8",
    quote: "Papers, runs and notes in one place. It remembers which learning rate diverged, so I don't have to.",
    trace: [
      { phase: "router", detail: "memory recall", ms: 5 },
      { phase: "memory", detail: "4 memories recalled", ms: 41 },
      { phase: "conversation", detail: "compare runs", ms: 960 },
    ],
    recalled: ["lr 3e-4 diverged after epoch 12", "Baseline: ResNet-50 on CIFAR-100", "Reviewer 2 asked for ablations"],
    graph: { center: "Thesis", nodes: ["ResNet-50", "CIFAR-100", "ablations", "lr 3e-4"] },
  },
  {
    id: "kenji",
    name: "Kenji",
    role: "Security engineer",
    workspace: "infra-audit",
    accent: "#F59E0B",
    quote: "It shows me the exact command and waits for my approval, every single time. That's the only way I'd let an agent near my laptop.",
    trace: [
      { phase: "router", detail: "execution", ms: 3 },
      { phase: "approval", detail: "bash: ss -tulpn — waiting", tone: "warn" },
      { phase: "execution", detail: "approved · ran once", ms: 210, tone: "ok" },
    ],
    recalled: ["Audit scope: staging only", "Model runs locally in Ollama", "Never touch prod credentials"],
    graph: { center: "infra-audit", nodes: ["staging", "ports", "Ollama", "firewall"] },
  },
  {
    id: "priya",
    name: "Priya",
    role: "Product manager",
    workspace: "roadmap",
    accent: "#FB7185",
    quote: "A Friday automation recaps what the team decided that week. I stopped writing the summary myself.",
    trace: [
      { phase: "automation", detail: "weekly · Friday 17:00" },
      { phase: "agent task", detail: "recap this week's decisions", ms: 1830 },
      { phase: "memory", detail: "recap saved", ms: 22, tone: "ok" },
    ],
    recalled: ["Q4 goal: ship offline mode", "Pricing page moves to v2", "Mobile app is paused"],
    graph: { center: "Roadmap", nodes: ["offline mode", "pricing v2", "mobile", "Q4"] },
  },
]

const FRAGMENTS = [
  "memory.store → “prefers dark mode”",
  "router → memory · 4ms",
  "bash awaiting approval",
  "graph + Svelte ─ RELATED_TO ─ frontend",
  "automation · weekly · Fri 17:00",
  "recall · 3 memories · 38ms",
  "workspace: thesis",
  "approved · ran once",
  "keyword + vector search",
  "memory.store → “demo day 14 Oct”",
]

const STORY_MS = 9000

const PHASE_ICON: Record<string, typeof Zap> = {
  router: Zap,
  memory: Database,
  conversation: BrainCircuit,
  approval: ShieldCheck,
  execution: Terminal,
  automation: Zap,
  "agent task": BrainCircuit,
}

function useTypewriter(text: string, enabled: boolean) {
  const [count, setCount] = useState(enabled ? 0 : text.length)
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => {
      setCount((c) => {
        if (c >= text.length) {
          clearInterval(id)
          return c
        }
        return c + 1
      })
    }, 24)
    return () => clearInterval(id)
  }, [text, enabled])
  return { typed: text.slice(0, enabled ? count : text.length), done: !enabled || count >= text.length }
}

function Avatar({ story, active, size = 44 }: { story: Story; active: boolean; size?: number }) {
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      {active && (
        <motion.span
          aria-hidden
          className="absolute inset-[-3px] rounded-full"
          style={{ background: `conic-gradient(from 0deg, ${story.accent}, transparent 60%, ${story.accent})` }}
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
        />
      )}
      <span
        className="relative flex h-full w-full items-center justify-center rounded-full border font-display text-sm font-bold"
        style={{
          background: `radial-gradient(circle at 30% 30%, ${story.accent}33, #0B1020 70%)`,
          borderColor: active ? `${story.accent}` : "rgba(255,255,255,0.08)",
          color: story.accent,
        }}
      >
        {story.name[0]}
      </span>
    </span>
  )
}

function MiniGraph({ story, reduce }: { story: Story; reduce: boolean }) {
  const cx = 110
  const cy = 70
  const points = [
    [30, 22],
    [192, 26],
    [36, 124],
    [188, 118],
  ]
  return (
    <svg viewBox="0 0 220 145" className="h-full w-full" role="img" aria-label={`Knowledge graph around ${story.graph.center}`}>
      {points.map(([x, y], i) => (
        <motion.line
          key={`e-${i}`}
          x1={cx}
          y1={cy}
          x2={x}
          y2={y}
          stroke={story.accent}
          strokeOpacity={0.45}
          strokeWidth={1}
          initial={{ pathLength: reduce ? 1 : 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 1.6 + i * 0.18, duration: 0.5 }}
        />
      ))}
      {points.map(([x, y], i) => (
        <motion.g
          key={`n-${i}`}
          initial={{ opacity: reduce ? 1 : 0, scale: reduce ? 1 : 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1.9 + i * 0.18, type: "spring", stiffness: 260, damping: 18 }}
          style={{ transformOrigin: `${x}px ${y}px` }}
        >
          <circle cx={x} cy={y} r={4} fill={story.accent} />
          <text x={x} y={y + (y < cy ? -9 : 15)} textAnchor="middle" className="fill-slate-400 font-mono" fontSize={9}>
            {story.graph.nodes[i]}
          </text>
        </motion.g>
      ))}
      {!reduce && (
        <motion.circle
          cx={cx}
          cy={cy}
          fill="none"
          stroke={story.accent}
          initial={{ r: 7, opacity: 0.6 }}
          animate={{ r: 22, opacity: 0 }}
          transition={{ repeat: Infinity, duration: 2.2, ease: "easeOut" }}
        />
      )}
      <circle cx={cx} cy={cy} r={7} fill={story.accent} />
      <text x={cx} y={cy + 22} textAnchor="middle" className="fill-slate-200 font-mono" fontSize={10} fontWeight={600}>
        {story.graph.center}
      </text>
    </svg>
  )
}

function StoryPanel({ story, reduce }: { story: Story; reduce: boolean }) {
  const { typed, done } = useTypewriter(story.quote, !reduce)
  const traceStart = reduce ? 0 : 0.5

  return (
    <motion.div
      key={story.id}
      initial={{ opacity: 0, y: reduce ? 0 : 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reduce ? 0 : -10 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col gap-6"
    >
      {/* Quote */}
      <div>
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em]" style={{ color: story.accent }}>
          {story.name} · {story.role}
        </p>
        <blockquote
          className="min-h-[5.5rem] font-display text-xl leading-snug text-slate-100 sm:min-h-[6rem] sm:text-2xl md:text-[1.7rem]"
          aria-label={story.quote}
        >
          <span aria-hidden>“{typed}</span>
          {!done && (
            <motion.span
              aria-hidden
              className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[3px] align-baseline"
              style={{ background: story.accent }}
              animate={{ opacity: [1, 0] }}
              transition={{ repeat: Infinity, duration: 0.6 }}
            />
          )}
          {done && <span aria-hidden>”</span>}
        </blockquote>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        {/* Agent trace + recalled memories */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Agent trace</p>
            <ol className="space-y-2">
              {story.trace.map((step, i) => {
                const Icon = PHASE_ICON[step.phase] ?? Zap
                const color = step.tone === "warn" ? "#F59E0B" : step.tone === "ok" ? "#34D399" : story.accent
                return (
                  <motion.li
                    key={step.phase + i}
                    initial={{ opacity: 0, x: reduce ? 0 : -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: traceStart + i * 0.35, duration: 0.3 }}
                    className="flex items-center gap-2.5 font-mono text-[12px]"
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />
                    <span className="text-slate-300">{step.phase}</span>
                    <span className="truncate text-slate-500">{step.detail}</span>
                    {step.ms !== undefined && <span className="ml-auto shrink-0 text-slate-600">{step.ms}ms</span>}
                  </motion.li>
                )
              })}
            </ol>
          </div>

          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Recalled from memory</p>
            <div className="flex flex-wrap gap-2">
              {story.recalled.map((m, i) => (
                <motion.span
                  key={m}
                  initial={{ opacity: 0, scale: reduce ? 1 : 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: (reduce ? 0 : 1.3) + i * 0.15, type: "spring", stiffness: 300, damping: 20 }}
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] text-slate-300"
                  style={{ borderColor: `${story.accent}40`, background: `${story.accent}12` }}
                >
                  <CheckCircle2 className="h-3 w-3" style={{ color: story.accent }} />
                  {m}
                </motion.span>
              ))}
            </div>
          </div>
        </div>

        {/* Mini knowledge graph */}
        <div className="relative h-[200px] rounded-xl border border-white/[0.06] bg-black/20 p-2 lg:h-auto lg:min-h-[180px]">
          <p className="absolute left-4 top-3 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">Knowledge graph</p>
          <div className="h-full pt-5">
            <MiniGraph story={story} reduce={reduce} />
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export function WorkspaceStories() {
  const reduce = useReducedMotion() ?? false
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const story = STORIES[active]
  const tablist = useRef<HTMLDivElement>(null)

  const next = () => setActive((i) => (i + 1) % STORIES.length)

  // On phones the people are a horizontal row: keep the active one in view. Scrolls only the
  // row itself, never the page (scrollIntoView would jump the whole page to this section).
  useEffect(() => {
    const row = tablist.current
    const tab = row?.children[active] as HTMLElement | undefined
    if (!row || !tab || row.scrollWidth <= row.clientWidth) return
    row.scrollTo({ left: tab.offsetLeft - (row.clientWidth - tab.offsetWidth) / 2, behavior: reduce ? "auto" : "smooth" })
  }, [active, reduce])

  return (
    <div
      className="mx-auto w-full max-w-6xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0B1020]/80 shadow-2xl backdrop-blur-sm">
        {/* Accent glow that follows the active story */}
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full blur-[110px]"
          animate={{ backgroundColor: story.accent, opacity: 0.18 }}
          transition={{ duration: 0.8 }}
        />
        {/* Faint grid */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        {/* Window chrome */}
        <div className="relative flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
          <div className="flex gap-1.5" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]/70" />
          </div>
          <span className="truncate font-mono text-[11px] text-slate-500">~/.torvaix/workspaces/{story.workspace}</span>
          <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">
            <motion.span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: story.accent }}
              animate={reduce ? undefined : { opacity: [1, 0.3, 1] }}
              transition={{ repeat: Infinity, duration: 1.6 }}
            />
            session
          </span>
        </div>

        <div className="relative grid md:grid-cols-[240px_1fr]">
          {/* People */}
          <div
            ref={tablist}
            role="tablist"
            aria-label="Workspace stories"
            className="relative flex gap-2 overflow-x-auto border-b border-white/[0.06] p-3 md:flex-col md:overflow-visible md:border-b-0 md:border-r md:p-4"
          >
            {STORIES.map((s, i) => {
              const isActive = i === active
              return (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActive(i)}
                  className={`relative flex shrink-0 items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-left transition-colors ${
                    isActive ? "bg-white/[0.05]" : "hover:bg-white/[0.03]"
                  }`}
                >
                  <Avatar story={s} active={isActive} size={36} />
                  <span className="min-w-0">
                    <span className={`block font-display text-sm font-semibold ${isActive ? "text-slate-100" : "text-slate-400"}`}>{s.name}</span>
                    <span className="block truncate font-mono text-[10px] text-slate-500">{s.role}</span>
                  </span>
                  {isActive && (
                    <span className="absolute inset-x-3 bottom-1 h-[2px] overflow-hidden rounded-full bg-white/[0.06]">
                      <span
                        key={`${s.id}-${active}`}
                        className="block h-full rounded-full"
                        style={{
                          background: s.accent,
                          animation: `story-progress ${STORY_MS}ms linear forwards`,
                          animationPlayState: paused || reduce ? "paused" : "running",
                        }}
                        onAnimationEnd={next}
                      />
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Session */}
          <div className="relative min-h-[420px] p-5 sm:p-7" role="tabpanel" aria-live="polite">
            <AnimatePresence mode="wait">
              <StoryPanel key={story.id} story={story} reduce={reduce} />
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Memory fragments ticker */}
      <div className="relative mt-8 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]" aria-hidden>
        <div className="flex w-max gap-8 whitespace-nowrap font-mono text-[11px] text-slate-600" style={{ animation: reduce ? undefined : "story-marquee 45s linear infinite" }}>
          {[...FRAGMENTS, ...FRAGMENTS].map((f, i) => (
            <span key={i} className="flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-[#00D4AA]/60" />
              {f}
            </span>
          ))}
        </div>
      </div>

      <p className="mt-6 text-center font-mono text-[11px] text-slate-600">
        Illustrative workspace stories based on what Torvaix does today — not customer testimonials.
      </p>
    </div>
  )
}
