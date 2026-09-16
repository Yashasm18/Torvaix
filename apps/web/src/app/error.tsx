"use client" // Error boundaries must be Client Components

import { useEffect } from "react"
import { ErrorState } from "@/components/error-state"

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error("[Torvaix] Unhandled error:", error)
  }, [error])

  return <ErrorState error={error} retry={unstable_retry} />
}
