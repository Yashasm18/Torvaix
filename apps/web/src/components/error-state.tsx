"use client"

import Link from "next/link"
import { AlertTriangle, RotateCcw, Home } from "lucide-react"

/**
 * Shared fallback for Next error boundaries. Without these, a runtime error left the user
 * on a blank screen with no way back.
 */
export function ErrorState({
  error,
  retry,
  title = "Something went wrong",
}: {
  error: Error & { digest?: string }
  retry?: () => void
  title?: string
}) {
  return (
    <div className="flex h-full min-h-[60vh] w-full flex-1 items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 text-center shadow-lg">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20">
          <AlertTriangle className="h-6 w-6 text-red-400" />
        </div>
        <h2 className="mb-2 text-lg font-semibold text-foreground">{title}</h2>
        <p className="mb-1 text-sm text-muted-foreground">
          This page hit an unexpected error. Your workspace data is safe.
        </p>
        {error?.message && (
          <p className="mb-4 break-words font-mono text-xs text-muted-foreground/80">{error.message}</p>
        )}
        {error?.digest && (
          <p className="mb-4 font-mono text-[11px] text-muted-foreground/60">Reference: {error.digest}</p>
        )}
        <div className="flex items-center justify-center gap-2">
          {retry && (
            <button
              type="button"
              onClick={retry}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <RotateCcw className="h-4 w-4" /> Try again
            </button>
          )}
          <Link
            href="/chat"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <Home className="h-4 w-4" /> Back to chat
          </Link>
        </div>
      </div>
    </div>
  )
}
