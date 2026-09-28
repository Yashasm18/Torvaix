"use client"

import { useRef, useState, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ChevronLeft, ChevronRight } from "lucide-react"

/**
 * A deliberately silly "customer reviews" carousel. Every reviewer is made up and obviously so;
 * the joke behind each one is a real Torvaix feature (memory, approval before commands, the
 * knowledge graph, running locally instead of paying a subscription). The section says so.
 */

const svg = { viewBox: "0 0 80 80", "aria-hidden": true, className: "h-full w-full" } as const

function SteveAvatar() {
  return (
    <svg {...svg}>
      <rect width="80" height="80" fill="#1e293b" />
      <path d="M8 80c3-18 17-25 32-25s29 7 32 25z" fill="#334155" />
      <path d="M33 55l7 8 7-8-3-3h-8z" fill="#f8fafc" />
      <path d="M38 60h4l3 18H35z" fill="#ef4444" />
      <circle cx="40" cy="34" r="15" fill="#f1c9a5" />
      <path d="M24 31c1-15 31-15 32 0-7-6-25-6-32 0z" fill="#3b2f2a" />
      <circle cx="34.5" cy="35" r="1.9" fill="#1f2937" />
      <circle cx="45.5" cy="35" r="1.9" fill="#1f2937" />
      <path d="M32 41q8 9 16 0" stroke="#7c2d12" strokeWidth="2.2" fill="none" strokeLinecap="round" />
    </svg>
  )
}

function DanaAvatar() {
  return (
    <svg {...svg}>
      <rect width="80" height="80" fill="#172033" />
      <path d="M8 80c2-19 18-27 32-27s30 8 32 27z" fill="#115e59" />
      <circle cx="40" cy="36" r="15" fill="#c68a5e" />
      <path d="M24 34c-1-19 32-19 32 0" stroke="#e2e8f0" strokeWidth="3" fill="none" />
      <rect x="20" y="32" width="7" height="13" rx="3.5" fill="#e2e8f0" />
      <rect x="53" y="32" width="7" height="13" rx="3.5" fill="#e2e8f0" />
      <path d="M31 38h8M42 38h8" stroke="#1f2937" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M31.5 41q3.5 2.5 7 0M42.5 41q3.5 2.5 7 0" stroke="#7c4a2d" strokeWidth="1.4" fill="none" />
      <path d="M35 47h10" stroke="#5b3a24" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function NigelAvatar() {
  return (
    <svg {...svg}>
      <rect width="80" height="80" fill="#0f2233" />
      <g stroke="#38bdf8" strokeWidth="1" opacity="0.45">
        <line x1="8" y1="14" x2="20" y2="24" />
        <line x1="20" y1="24" x2="10" y2="38" />
        <line x1="72" y1="14" x2="62" y2="26" />
        <line x1="62" y1="26" x2="71" y2="40" />
      </g>
      <g fill="#38bdf8" opacity="0.7">
        <circle cx="8" cy="14" r="2.2" />
        <circle cx="20" cy="24" r="2.2" />
        <circle cx="10" cy="38" r="2.2" />
        <circle cx="72" cy="14" r="2.2" />
        <circle cx="62" cy="26" r="2.2" />
        <circle cx="71" cy="40" r="2.2" />
      </g>
      <path d="M8 80c3-18 17-25 32-25s29 7 32 25z" fill="#475569" />
      <path d="M32 55l8 15 8-15" stroke="#38bdf8" strokeWidth="2" fill="none" />
      <rect x="34" y="66" width="12" height="9" rx="1.5" fill="#f8fafc" />
      <path d="M37 70h6M37 72.5h4" stroke="#475569" strokeWidth="1" />
      <circle cx="40" cy="34" r="15" fill="#e9b98f" />
      <path d="M25 30c2-11 28-11 30 0-3-3-9-4-15-4s-12 1-15 4z" fill="#9ca3af" />
      <circle cx="34.5" cy="35" r="1.9" fill="#1f2937" />
      <circle cx="45.5" cy="35" r="1.9" fill="#1f2937" />
      <path d="M31 41q9 10 18 0z" fill="#fff" stroke="#7c2d12" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}

function AdaAvatar() {
  return (
    <svg {...svg}>
      <rect width="80" height="80" fill="#241a36" />
      <path d="M8 80c3-18 17-25 32-25s29 7 32 25z" fill="#e2e8f0" />
      <path d="M40 55l-6 10h12z" fill="#cbd5e1" />
      <circle cx="40" cy="40" r="14" fill="#8d5a3b" />
      <path d="M18 22l22-9 22 9-22 9z" fill="#111827" />
      <path d="M28 28v7c4 4 20 4 24 0v-7" fill="#1f2937" />
      <path d="M60 23v11" stroke="#f5b301" strokeWidth="2" />
      <circle cx="60" cy="35" r="2" fill="#f5b301" />
      <circle cx="34.5" cy="41" r="4.6" fill="none" stroke="#f8fafc" strokeWidth="1.6" />
      <circle cx="45.5" cy="41" r="4.6" fill="none" stroke="#f8fafc" strokeWidth="1.6" />
      <path d="M39 41h2" stroke="#f8fafc" strokeWidth="1.6" />
      <circle cx="34.5" cy="41" r="1.5" fill="#1f2937" />
      <circle cx="45.5" cy="41" r="1.5" fill="#1f2937" />
      <path d="M35 48q5 4 10 0" stroke="#3b1f10" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  )
}

function SubscriptionAvatar() {
  return (
    <svg {...svg}>
      <rect width="80" height="80" fill="#2a1418" />
      <rect x="9" y="21" width="62" height="42" rx="6" fill="#e5e7eb" />
      <rect x="9" y="29" width="62" height="8" fill="#374151" />
      <path d="M23 43l7 7M30 43l-7 7M50 43l7 7M57 43l-7 7" stroke="#dc2626" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M28 58q4-4 8 0t8 0t8 0" stroke="#374151" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M66 10q5 7 0 11q-5-4 0-11z" fill="#38bdf8" />
      <text x="40" y="75" textAnchor="middle" fontSize="8" fontWeight="700" fill="#f87171" fontFamily="monospace">$20/mo</text>
    </svg>
  )
}

interface Review {
  id: string
  quote: string
  stars: number
  name: string
  role: string
  avatar: ReactNode
  gag?: boolean
}

const REVIEWS: Review[] = [
  {
    id: "steve",
    quote: "Torvaix remembered the meeting. Nobody else remembered the meeting. We are now a memory-driven organisation.",
    stars: 5,
    name: "Synergy Steve",
    role: "VP of Leveraging, Paradigm Shift Partners LLC",
    avatar: <SteveAvatar />,
  },
  {
    id: "dana",
    quote:
      "It showed me the exact command and waited for my approval. I said no. It is the first tool in my career to respect my boundaries.",
    stars: 5,
    name: "Dana Downtime",
    role: "Senior Site Reliability Feelings Engineer, Pager & Sons",
    avatar: <DanaAvatar />,
  },
  {
    id: "nigel",
    quote: "Three months in, my knowledge graph knows more people than I do. Four stars, because it still hasn't got me promoted.",
    stars: 4,
    name: "Networking Nigel",
    role: "Chief Connections Officer, Six Degrees Ltd.",
    avatar: <NigelAvatar />,
  },
  {
    id: "ada",
    quote: "I mentioned my favourite framework once. Weeks later it still knew. I have never felt so seen by a folder on my hard drive.",
    stars: 5,
    name: "Dr. Ada Overfit",
    role: "Head of Vibes, Gradient Descent GmbH",
    avatar: <AdaAvatar />,
  },
  {
    id: "subscription",
    quote: "Wait, you can just RUN it yourself?? Where are you going? Come back. I'll do $15.",
    stars: 0,
    name: "Monthly Subscription",
    role: "Recurring Revenue, $20/month (forever)",
    avatar: <SubscriptionAvatar />,
    gag: true,
  },
]

function Stars({ count, reduce }: { count: number; reduce: boolean }) {
  return (
    <div className="mb-2 flex gap-1 text-base" role="img" aria-label={`${count} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <motion.span
          key={i}
          aria-hidden
          initial={{ scale: reduce ? 1 : 0, opacity: reduce ? 1 : 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: reduce ? 0 : 0.25 + i * 0.07, type: "spring", stiffness: 520, damping: 16 }}
          className={i < count ? "text-[#F5B301]" : "text-slate-600"}
        >
          {i < count ? "★" : "☆"}
        </motion.span>
      ))}
    </div>
  )
}

function ArrowButton({ dir, onClick, className = "" }: { dir: -1 | 1; onClick: () => void; className?: string }) {
  const Icon = dir < 0 ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir < 0 ? "Previous review" : "Next review"}
      className={`flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#0B1020]/90 text-slate-300 transition-colors hover:border-[#00D4AA] hover:text-[#00D4AA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D4AA]/60 ${className}`}
    >
      <Icon className="h-5 w-5" />
    </button>
  )
}

export function CustomerReviews() {
  const reduce = useReducedMotion() ?? false
  const [index, setIndex] = useState(0)
  const [dir, setDir] = useState<1 | -1>(1)
  const touchX = useRef<number | null>(null)
  const review = REVIEWS[index]

  const go = (to: number, direction: 1 | -1) => {
    setDir(direction)
    setIndex((to + REVIEWS.length) % REVIEWS.length)
  }
  const step = (direction: 1 | -1) => go(index + direction, direction)

  return (
    <div
      className="mx-auto w-full max-w-[820px] outline-none"
      role="region"
      aria-roledescription="carousel"
      aria-label="Customer reviews"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") step(1)
        if (e.key === "ArrowLeft") step(-1)
      }}
    >
      <div className="relative">
        <ArrowButton dir={-1} onClick={() => step(-1)} className="absolute -left-14 top-1/2 hidden -translate-y-1/2 md:flex" />
        <ArrowButton dir={1} onClick={() => step(1)} className="absolute -right-14 top-1/2 hidden -translate-y-1/2 md:flex" />

        <div
          className="cursor-pointer select-text overflow-hidden"
          onClick={() => {
            if (!window.getSelection()?.toString()) step(1)
          }}
          onTouchStart={(e) => {
            touchX.current = e.touches[0].clientX
          }}
          onTouchEnd={(e) => {
            if (touchX.current === null) return
            const dx = e.changedTouches[0].clientX - touchX.current
            touchX.current = null
            if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1)
          }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={review.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${REVIEWS.length}`}
              aria-live="polite"
              initial={{ opacity: 0, x: reduce ? 0 : dir * 48 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: reduce ? 0 : dir * -48 }}
              transition={{ duration: 0.24, ease: "easeOut" }}
            >
              <motion.figure
                animate={review.gag && !reduce ? { x: [0, -9, 9, -7, 7, -4, 0], rotate: [0, -1.5, 1.5, -1, 1, 0, 0] } : undefined}
                transition={{ duration: 0.7, delay: 0.3 }}
                className={`flex min-h-[27rem] flex-col items-center justify-center gap-6 rounded-2xl border p-6 text-center sm:min-h-[16rem] sm:flex-row-reverse sm:p-8 sm:text-left ${
                  review.gag
                    ? "border-red-400/40 bg-gradient-to-b from-red-500/[0.07] to-white/[0.02]"
                    : "border-white/10 bg-white/[0.03]"
                }`}
              >
                <motion.span
                  whileHover={reduce ? undefined : { rotate: 6, scale: 1.06 }}
                  className={`block h-24 w-24 shrink-0 overflow-hidden rounded-full border-2 ${review.gag ? "border-red-400/60" : "border-white/15"}`}
                >
                  {review.avatar}
                </motion.span>

                <div className="min-w-0 flex-1">
                  <blockquote
                    className={`mb-4 font-display text-lg leading-snug sm:text-xl md:text-[1.4rem] ${
                      review.gag ? "font-bold tracking-wide text-red-300" : "text-slate-100"
                    }`}
                  >
                    “{review.quote}”
                  </blockquote>
                  <div className="flex justify-center sm:justify-start">
                    <Stars count={review.stars} reduce={reduce} />
                  </div>
                  <figcaption>
                    <span className="block text-[15px] font-bold text-slate-100">{review.name}</span>
                    <span className="block text-[13px] text-slate-500">{review.role}</span>
                  </figcaption>
                </div>
              </motion.figure>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="mt-5 flex flex-col items-center gap-3">
        <div className="flex items-center gap-4">
          <ArrowButton dir={-1} onClick={() => step(-1)} className="md:hidden" />
          <div className="flex gap-2">
            {REVIEWS.map((r, i) => (
              <button
                key={r.id}
                type="button"
                aria-label={`Show review ${i + 1}: ${r.name}`}
                aria-current={i === index}
                onClick={() => go(i, i > index ? 1 : -1)}
                className={`h-2.5 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D4AA]/60 ${
                  i === index ? "w-6 bg-[#00D4AA]" : "w-2.5 bg-slate-600 hover:bg-slate-500"
                }`}
              />
            ))}
          </div>
          <ArrowButton dir={1} onClick={() => step(1)} className="md:hidden" />
        </div>
        <p className="text-center font-mono text-[11px] text-slate-500">click, tap or swipe for the next totally real customer →</p>
        <p className="max-w-md text-center font-mono text-[11px] text-slate-600">
          Every reviewer here is made up. The features they mention are not.
        </p>
      </div>
    </div>
  )
}
