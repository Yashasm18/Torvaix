"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

interface AppLogoProps {
  className?: string;
  size?: number;
  /** The orbits turn while the pointer is over the logo. */
  animated?: boolean;
  /** The orbits keep turning, e.g. while Torvaix is working on a reply. */
  spinning?: boolean;
}

/**
 * The orbits turn with CSS (see .app-logo in globals.css), and only when asked. They used to be
 * framer-motion animations that never stopped: the logo in the sidebar redrew the page 60 times
 * a second on every page, about a tenth of a CPU core while nothing happened.
 */
export function AppLogo({ className, size = 24, animated = true, spinning = false }: AppLogoProps) {
  // SVG gradient ids are document-global; hardcoded ids collide when the logo renders
  // more than once, and url(#id) then resolves to whichever copy appears first.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const orbit1 = `${uid}-orbit1`;
  const orbit2 = `${uid}-orbit2`;
  const orbit3 = `${uid}-orbit3`;

  return (
    <div
      className={cn(
        "app-logo relative flex items-center justify-center shrink-0",
        animated && "app-logo-interactive",
        spinning && "app-logo-spinning",
        className
      )}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        <defs>
          <linearGradient id={orbit1} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00D4AA" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
          <linearGradient id={orbit2} x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
          <linearGradient id={orbit3} x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#a855f7" />
            <stop offset="100%" stopColor="#00D4AA" />
          </linearGradient>
        </defs>

        {/* Orbit 1 */}
        <g transform="rotate(30 50 50)">
          <ellipse
            className="app-logo-orbit"
            cx="50"
            cy="50"
            rx="40"
            ry="15"
            fill="none"
            stroke={`url(#${orbit1})`}
            strokeWidth="6"
            strokeLinecap="round"
          />
        </g>

        {/* Orbit 2 */}
        <g transform="rotate(150 50 50)">
          <ellipse
            className="app-logo-orbit app-logo-orbit-slow"
            cx="50"
            cy="50"
            rx="40"
            ry="15"
            fill="none"
            stroke={`url(#${orbit2})`}
            strokeWidth="6"
            strokeLinecap="round"
          />
        </g>

        {/* Orbit 3 (Core Ring) */}
        <circle
          cx="50"
          cy="50"
          r="25"
          fill="none"
          stroke={`url(#${orbit3})`}
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
    </div>
  );
}
