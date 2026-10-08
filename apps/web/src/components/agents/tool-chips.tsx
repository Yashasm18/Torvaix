import { Shield } from "lucide-react"
import type { AgentToolInfo } from "@/lib/agents"
import { approvalToolIds } from "@/lib/agent-form"

/**
 * The tools an agent may use, as small chips. Tools that ask for approval before every run carry
 * a shield, spelled out for screen readers and in a note, so it isn't only a colour.
 */
export function ToolChips({
  toolIds,
  tools,
  showNote = true,
}: {
  toolIds: string[]
  tools: AgentToolInfo[]
  showNote?: boolean
}) {
  if (toolIds.length === 0) {
    return <p className="text-xs text-muted-foreground">No tools. This agent can only reply with text.</p>
  }

  const info = new Map(tools.map((tool) => [tool.id, tool]))
  const asking = approvalToolIds(toolIds, tools)

  return (
    <div className="space-y-1.5">
      <ul aria-label="Tools" className="flex flex-wrap gap-1.5">
        {toolIds.map((id) => {
          const tool = info.get(id)
          const label = tool?.label ?? id
          const needsApproval = asking.includes(id)
          return (
            <li
              key={id}
              title={needsApproval ? `${label} asks for your approval before every run.` : tool?.description}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-mono ${
                needsApproval
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                  : "border-border bg-muted text-muted-foreground"
              }`}
            >
              {needsApproval && <Shield className="w-3 h-3" aria-hidden="true" />}
              {label}
              {needsApproval && <span className="sr-only"> (asks for approval before every run)</span>}
            </li>
          )
        })}
      </ul>
      {showNote && asking.length > 0 && (
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Shield className="w-3 h-3 text-amber-400 shrink-0" aria-hidden="true" />
          Tools with a shield ask for your approval before every run.
        </p>
      )}
    </div>
  )
}
