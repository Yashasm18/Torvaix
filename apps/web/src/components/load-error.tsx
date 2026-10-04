import { AlertCircle, RotateCcw } from "lucide-react"

/**
 * Shown when a page couldn't load its data. Without it the page looked like an empty workspace,
 * which reads as "my memories are gone" when the agent server is merely stopped.
 */
export function LoadError({ message, onRetry, className = "" }: { message: string; onRetry: () => void; className?: string }) {
  return (
    <div role="alert" className={`flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-3 text-sm text-red-400 ${className}`}>
      <AlertCircle className="w-4 h-4 shrink-0" />
      <span className="flex-1 min-w-0 break-words">{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-1.5 shrink-0 rounded-md px-2 py-1 text-xs font-medium text-red-300 hover:bg-red-500/10 hover:text-red-200"
      >
        <RotateCcw className="w-3.5 h-3.5" /> Try again
      </button>
    </div>
  )
}
