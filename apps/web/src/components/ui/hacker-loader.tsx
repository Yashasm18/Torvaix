"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function HackerLoader() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In a real app, this would wait for local DB and LLM connection checks.
    // For now, we simulate a fast boot.
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {loading && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
          className="fixed inset-0 z-[99999] bg-background flex flex-col items-center justify-center gap-2"
        >
          {/* We use an after pseudo-element with the CSS animation for the true retro feel */}
          <div 
            className="text-[var(--brand-color)] font-mono text-xs opacity-50 after:content-['▁▂▃'] after:animate-[loader-wave_1.35s_steps(1)_infinite]"
            aria-label="Loading..."
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
