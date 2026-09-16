import Link from "next/link"

export default function NotFound() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6 text-center shadow-lg">
        <p className="mb-2 font-mono text-sm text-primary">404</p>
        <h1 className="mb-2 text-lg font-semibold text-foreground">Page not found</h1>
        <p className="mb-5 text-sm text-muted-foreground">
          That page doesn&apos;t exist in Torvaix. It may have been renamed or removed.
        </p>
        <div className="flex items-center justify-center gap-2">
          <Link
            href="/chat"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Open chat
          </Link>
          <Link
            href="/workspace"
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
