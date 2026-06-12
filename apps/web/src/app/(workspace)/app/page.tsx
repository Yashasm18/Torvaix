"use client"

import { motion } from "framer-motion"
import { Folder, Bot, BrainCircuit, Activity, CheckCircle2 } from "lucide-react"
import Link from "next/link"

import { AppLogo } from "@/components/ui/app-logo"

export default function OSWorkspace() {
  const timeOfDay = () => {
    const hour = new Date().getHours()
    if (hour < 12) return "Morning"
    if (hour < 18) return "Afternoon"
    return "Evening"
  }

  const activities = [
    { time: "11:30", action: "DeepSeek generated code patch", icon: CheckCircle2, color: "text-primary" },
    { time: "10:44", action: "Knowledge extracted from chat", icon: BrainCircuit, color: "text-blue-400" },
    { time: "09:12", action: "Research Agent completed summary", icon: Bot, color: "text-purple-400" },
  ]

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-y-auto">
      <div className="max-w-5xl w-full mx-auto p-8 md:p-12">
        {/* Greeting */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-12"
        >
          <h1 className="text-4xl font-bold tracking-tight text-foreground mb-2">Good {timeOfDay()}, Yashas</h1>
          <p className="text-muted-foreground text-lg">Here is what&apos;s happening in your workspace today.</p>
        </motion.div>

        {/* Quick Stats Grid */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16"
        >
          <div className="bg-surface border border-border p-6 rounded-2xl flex flex-col items-start shadow-sm">
            <div className="flex items-center gap-3 mb-4 text-foreground font-medium">
              <Folder className="w-5 h-5 text-blue-400" /> Active Projects
            </div>
            <div className="text-4xl font-bold text-foreground">3</div>
          </div>
          <div className="bg-surface border border-border p-6 rounded-2xl flex flex-col items-start shadow-sm">
            <div className="flex items-center gap-3 mb-4 text-foreground font-medium">
              <Bot className="w-5 h-5 text-primary" /> Agents Running
            </div>
            <div className="text-4xl font-bold text-foreground">2</div>
            <div className="w-2 h-2 rounded-full bg-primary absolute top-6 right-6 animate-pulse" />
          </div>
          <div className="bg-surface border border-border p-6 rounded-2xl flex flex-col items-start shadow-sm">
            <div className="flex items-center gap-3 mb-4 text-foreground font-medium">
              <BrainCircuit className="w-5 h-5 text-purple-400" /> Memories Retrieved
            </div>
            <div className="text-4xl font-bold text-foreground">14<span className="text-sm font-normal text-muted-foreground ml-2">Today</span></div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Today Command Feed */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-col"
          >
            <div className="flex items-center gap-2 mb-6 text-foreground font-semibold">
              <Activity className="w-5 h-5 text-muted-foreground" />
              Today
            </div>
            <div className="flex flex-col relative before:absolute before:inset-0 before:ml-[1.4rem] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
              {activities.map((item, i) => (
                <div key={i} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active mb-6 last:mb-0">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-background bg-surface text-muted-foreground shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                    <item.icon className={`w-4 h-4 ${item.color}`} />
                  </div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-border bg-surface shadow-sm">
                    <div className="flex items-center justify-between mb-1">
                      <time className="text-xs font-mono text-muted-foreground">{item.time}</time>
                    </div>
                    <div className="text-sm text-foreground">{item.action}</div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Signature Visual Element: Knowledge Pulse */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col"
          >
            <div className="flex items-center gap-2 mb-6 text-foreground font-semibold">
              Knowledge Pulse
            </div>
            <div className="bg-surface border border-border rounded-2xl h-[300px] relative overflow-hidden flex items-center justify-center">
              {/* Background gradient blur */}
              <div className="absolute inset-0 bg-primary/5 blur-3xl rounded-full scale-150" />
              
              {/* Central Node */}
              <div className="relative z-10 flex items-center justify-center">
                <motion.div 
                  animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute w-24 h-24 bg-primary/20 rounded-full blur-xl"
                />
                <div className="z-20">
                  <AppLogo size={48} animated={true} />
                </div>
                
                {/* Orbital Nodes */}
                <motion.div 
                  className="absolute w-40 h-40 border border-primary/20 rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                >
                  <Link href="/app/agents">
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-background border border-border px-3 py-1 rounded-full text-xs text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer">Agents</div>
                  </Link>
                </motion.div>

                <motion.div 
                  className="absolute w-60 h-60 border border-blue-400/20 rounded-full"
                  animate={{ rotate: -360 }}
                  transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                >
                  <Link href="/app/projects">
                    <div className="absolute top-1/2 -left-3 -translate-y-1/2 bg-background border border-border px-3 py-1 rounded-full text-xs text-muted-foreground hover:bg-blue-400/10 hover:text-blue-400 transition-colors cursor-pointer" style={{ transform: "translateY(-50%) rotate(360deg)" }}>Projects</div>
                  </Link>
                </motion.div>

                <motion.div 
                  className="absolute w-80 h-80 border border-purple-400/20 rounded-full"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
                >
                  <Link href="/app/knowledge">
                    <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-background border border-border px-3 py-1 rounded-full text-xs text-muted-foreground hover:bg-purple-400/10 hover:text-purple-400 transition-colors cursor-pointer" style={{ transform: "translateX(-50%) rotate(-360deg)" }}>Knowledge</div>
                  </Link>
                  <Link href="/app/memory">
                    <div className="absolute top-1/2 -right-3 -translate-y-1/2 bg-background border border-border px-3 py-1 rounded-full text-xs text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer" style={{ transform: "translateY(-50%) rotate(-360deg)" }}>Memory</div>
                  </Link>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
