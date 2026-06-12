"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface AppLogoProps {
  className?: string;
  size?: number;
  animated?: boolean;
}

export function AppLogo({ className, size = 24, animated = true }: AppLogoProps) {
  // We use Framer Motion for the interactive tap animation
  return (
    <motion.div
      whileTap={animated ? { scale: 0.9, rotate: 15 } : {}}
      whileHover={animated ? { scale: 1.05 } : {}}
      className={cn("relative flex items-center justify-center shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-lg"
      >
        <defs>
          <linearGradient id="orbit1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00D4AA" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
          <linearGradient id="orbit2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
          <linearGradient id="orbit3" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#a855f7" />
            <stop offset="100%" stopColor="#00D4AA" />
          </linearGradient>
        </defs>

        {/* Orbit 1 */}
        <motion.ellipse
          cx="50"
          cy="50"
          rx="40"
          ry="15"
          fill="none"
          stroke="url(#orbit1)"
          strokeWidth="6"
          strokeLinecap="round"
          transform="rotate(30 50 50)"
          animate={animated ? { rotate: [30, 390] } : {}}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        />
        
        {/* Orbit 2 */}
        <motion.ellipse
          cx="50"
          cy="50"
          rx="40"
          ry="15"
          fill="none"
          stroke="url(#orbit2)"
          strokeWidth="6"
          strokeLinecap="round"
          transform="rotate(150 50 50)"
          animate={animated ? { rotate: [150, 510] } : {}}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
        />

        {/* Orbit 3 (Core Ring) */}
        <motion.circle
          cx="50"
          cy="50"
          r="25"
          fill="none"
          stroke="url(#orbit3)"
          strokeWidth="6"
          strokeLinecap="round"
        />

        {/* Node 1 */}
        <circle cx="50" cy="25" r="7" fill="#ffffff" />
        
        {/* Node 2 */}
        <circle cx="28" cy="62" r="7" fill="#ffffff" />
        
        {/* Node 3 */}
        <circle cx="72" cy="62" r="7" fill="#ffffff" />

        {/* Center Node / Core */}
        <circle cx="50" cy="50" r="10" fill="#00D4AA" />
      </svg>
    </motion.div>
  );
}
