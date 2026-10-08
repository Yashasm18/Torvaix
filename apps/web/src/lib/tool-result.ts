/**
 * A tool run's output as text. The agent server stores it JSON-encoded, so a plain string comes
 * back wrapped in quotes with its line breaks written as "\n". Shown as it was, two lines of
 * output read as one line with stray quotes and backslashes.
 */
export function decodeToolResult(result: string | null | undefined): string {
  if (!result) return ""
  try {
    const value: unknown = JSON.parse(result)
    return typeof value === "string" ? value : JSON.stringify(value, null, 2)
  } catch {
    return result
  }
}
