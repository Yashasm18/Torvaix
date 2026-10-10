import { NextResponse } from "next/server"

export const AGENT_SERVER_URL = process.env.AGENT_SERVER_URL || "http://localhost:3001"

/**
 * Reply for an agent-server response that isn't OK, keeping its status. The agent answers with
 * `{ error, details? }`; pass those on as they are. Wrapping the raw body in another `error`
 * string made pages show JSON such as `{"error":"name is required"}` instead of the message.
 */
export async function agentErrorResponse(res: Response): Promise<NextResponse> {
  const text = await res.text()
  let error = text.trim()
  let details: string | undefined
  try {
    const body = JSON.parse(text)
    if (typeof body?.error === "string") {
      error = body.error
      if (typeof body.details === "string") details = body.details
    }
  } catch {
    // not JSON: use the text as it is
  }
  return NextResponse.json(
    { error: error || `The agent server returned HTTP ${res.status}`, ...(details ? { details } : {}) },
    { status: res.status }
  )
}

/**
 * Reply for a request that never got an answer. When the agent server is down, `fetch` throws
 * "fetch failed", which told the user nothing about what to do.
 */
export function agentFailureResponse(error: unknown): NextResponse {
  const name = (error as { name?: string } | null)?.name
  // Node's fetch reports a refused or dropped connection as TypeError("fetch failed").
  if ((error instanceof TypeError && error.message === "fetch failed") || name === "TimeoutError") {
    return NextResponse.json(
      { error: `The agent server isn't reachable at ${AGENT_SERVER_URL}. Start it with npm run dev.` },
      { status: 502 }
    )
  }
  const message = error instanceof Error && error.message ? error.message : "Internal server error"
  return NextResponse.json({ error: message }, { status: 500 })
}

/**
 * The JSON object sent with a request, or `{}` when there is no body, it isn't valid JSON, or it
 * isn't an object. Routes then report the field that is missing (400) instead of failing with
 * the parser's or a TypeError's message (500).
 */
export async function readJson(req: Request): Promise<Record<string, any>> {
  const body = await req.json().catch(() => null)
  return body && typeof body === "object" && !Array.isArray(body) ? body : {}
}
