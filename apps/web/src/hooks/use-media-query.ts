"use client"

import * as React from "react"

/** Live `window.matchMedia(query).matches`; false during server rendering. */
export function useMediaQuery(query: string): boolean {
  return React.useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    () => window.matchMedia(query).matches,
    () => false
  )
}
