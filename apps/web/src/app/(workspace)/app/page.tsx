"use client"

import { CommandPalette } from "@/components/command-palette";
import { motion } from "framer-motion";

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
          One Workspace. Every Model. Select a workspace from the sidebar or create a new one to begin.
        </motion.p>
      </motion.div>
      <CommandPalette />
    </div>
  );
}
