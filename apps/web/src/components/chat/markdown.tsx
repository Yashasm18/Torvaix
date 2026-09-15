"use client"

import Markdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

// react-markdown escapes raw HTML and sanitises link protocols by default, so model output
// can't inject markup or javascript: links.
const components: Components = {
  p: ({ children }) => <p className="leading-relaxed [&:not(:first-child)]:mt-3">{children}</p>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:opacity-80">
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="mt-3 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="mt-3 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }) => <h3 className="mt-4 text-lg font-semibold first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-4 text-base font-semibold first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-3 font-semibold first:mt-0">{children}</h4>,
  blockquote: ({ children }) => (
    <blockquote className="mt-3 border-l-2 border-primary/40 pl-3 text-muted-foreground">{children}</blockquote>
  ),
  hr: () => <hr className="my-4 border-border" />,
  table: ({ children }) => (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-border bg-muted/50 px-2 py-1 text-left font-medium">{children}</th>,
  td: ({ children }) => <td className="border border-border px-2 py-1 align-top">{children}</td>,
  pre: ({ children }) => (
    <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-background p-3 font-mono text-[13px] leading-relaxed [&>code]:bg-transparent [&>code]:p-0">
      {children}
    </pre>
  ),
  code: ({ className, children }) => (
    <code className={`rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em] ${className ?? ""}`}>{children}</code>
  ),
}

/** Render assistant replies (markdown from the model) with GitHub-flavoured markdown. */
export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="break-words text-[15px] text-foreground/90">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </Markdown>
    </div>
  )
}
