"use client"

import { CommandPalette } from "@/components/command-palette";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Play, Sparkles, Shield, Cpu, Bot, MessageSquare, Terminal, Search, Database, BookOpen, GitCompare, Mail, Search as SearchIcon, ChevronRight } from "lucide-react";

export default function Home() {
  return (
    <div className="flex-1 flex flex-col h-full bg-card relative overflow-hidden">
      <motion.div 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[100px] pointer-events-none"
        animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      
      <motion.div 
        className="flex-1 flex flex-col items-center justify-center p-8 text-center relative z-10"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <motion.div 
          className="w-20 h-20 bg-primary/10 border border-primary/20 text-primary rounded-3xl flex items-center justify-center text-4xl font-bold mb-8 shadow-[0_0_50px_-10px_var(--color-primary)] backdrop-blur-xl"
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          whileHover={{ scale: 1.05, rotate: 5 }}
        >
          T
        </motion.div>
        <motion.h1 
          className="text-5xl font-extrabold tracking-tight mb-4 bg-clip-text text-transparent bg-gradient-to-br from-foreground to-foreground/60"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          Welcome to Torvaix
        </motion.h1>
        <motion.p 
          className="text-lg text-muted-foreground max-w-md mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          Your self-hosting AI workspace. Start solving real problems with autonomous agents and tools.
        </motion.p>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="flex flex-col sm:flex-row items-center gap-4 mb-12"
        >
          <Link href="/app/chat">
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl px-8 py-6 text-lg font-semibold shadow-[0_0_25px_rgba(var(--color-primary),0.35)] transition-all hover:shadow-[0_0_35px_rgba(var(--color-primary),0.5)] hover:scale-[1.03] active:scale-[0.98] gap-2">
              <Play className="w-5 h-5" />
              Try Now
              <ChevronRight className="w-5 h-5" />
            </Button>
          </Link>
          <Button variant="outline" className="border-white/10 bg-transparent hover:bg-white/5 text-muted-foreground rounded-xl px-8 py-6 text-lg font-semibold transition-all gap-2">
            <Sparkles className="w-5 h-5" />
            Quick Start
          </Button>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl w-full"
        >
          <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center hover:bg-white/10 transition-all cursor-pointer group">
            <Bot className="w-8 h-8 text-primary mx-auto mb-2" />
            <div className="text-xs font-medium text-foreground">Autonomous Agents</div>
            <div className="text-xs text-muted-foreground mt-1">Plan & execute tasks</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center hover:bg-white/10 transition-all cursor-pointer group">
            <Terminal className="w-8 h-8 text-green-400 mx-auto mb-2" />
            <div className="text-xs font-medium text-foreground">Bash Tools</div>
            <div className="text-xs text-muted-foreground mt-1">Execute commands</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center hover:bg-white/10 transition-all cursor-pointer group">
            <SearchIcon className="w-8 h-8 text-blue-400 mx-auto mb-2" />
            <div className="text-xs font-medium text-foreground">Web Search</div>
            <div className="text-xs text-muted-foreground mt-1">Gather information</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center hover:bg-white/10 transition-all cursor-pointer group">
            <Shield className="w-8 h-8 text-purple-400 mx-auto mb-2" />
            <div className="text-xs font-medium text-foreground">Private</div>
            <div className="text-xs text-muted-foreground mt-1">Local processing</div>
          </div>
        </motion.div>
      </motion.div>
      <CommandPalette />
    </div>
  );
}
