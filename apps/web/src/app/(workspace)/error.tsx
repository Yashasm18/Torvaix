"use client" // Error boundaries must be Client Components

import { useEffect } from "react"
import { ErrorState } from "@/components/error-state"

/** Keeps the sidebar and shell usable when a single workspace page fails. */
export default function WorkspaceError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error("[Torvaix] Workspace page error:", error)
  }, [error])

  return <ErrorState error={error} retry={unstable_retry} title="This page couldn't load" />
}
