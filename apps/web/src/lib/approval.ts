/** Id of the pending action an agent message asks the user to approve, if any. */
export function parseApprovalId(content: string): string | null {
  return content.match(/Pending Action ID: `([a-f0-9-]+)`/)?.[1] ?? null
}

/** The part of a tool call a person needs to review: the command, the code, or the raw arguments. */
export function describeActionParams(params: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(params)
  } catch {
    return params
  }
  if (parsed && typeof parsed === "object") {
    const a = parsed as Record<string, unknown>
    if (typeof a.command === "string") return a.command
    if (typeof a.code === "string") return a.code
    return JSON.stringify(a, null, 2)
  }
  return String(parsed)
}
