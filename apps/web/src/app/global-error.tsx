"use client" // Error boundaries must be Client Components

import { useEffect } from "react"

/**
 * Replaces the root layout when it fails, so it must render its own <html>/<body>
 * and can't rely on the app's fonts or providers.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error("[Torvaix] Fatal error:", error)
  }, [error])

  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0b0f0e", color: "#e6edf3", fontFamily: "system-ui, sans-serif" }}>
        <title>Torvaix — something went wrong</title>
        <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ maxWidth: 420, textAlign: "center" }}>
            <h1 style={{ fontSize: 20, marginBottom: 8 }}>Torvaix couldn&apos;t start this page</h1>
            <p style={{ fontSize: 14, opacity: 0.75, marginBottom: 8 }}>
              Your workspace data is safe. Try again, and if it keeps happening restart the app with{" "}
              <code>npm run dev</code>.
            </p>
            {error?.digest && (
              <p style={{ fontSize: 12, opacity: 0.6, fontFamily: "monospace" }}>Reference: {error.digest}</p>
            )}
            <button
              type="button"
              onClick={() => unstable_retry()}
              style={{
                marginTop: 16,
                padding: "10px 18px",
                borderRadius: 8,
                border: "none",
                background: "#00d4aa",
                color: "#04211c",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  )
}
