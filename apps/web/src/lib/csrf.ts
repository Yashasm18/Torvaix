const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

/**
 * True for a state-changing request sent by another site from the user's browser.
 *
 * Browsers let any page fire "simple" cross-site POSTs (e.g. Content-Type text/plain) without a
 * CORS preflight, and the API routes parse the body as JSON regardless. Without this check a
 * malicious page could store memories, create automations or dispatch agent tasks.
 * Requests without Origin/Sec-Fetch-Site (curl, server-to-server) are not browser CSRF.
 */
export function isCrossSiteWrite(request: {
  method: string
  origin: string | null
  host: string | null
  secFetchSite: string | null
}): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return false
  if (request.secFetchSite === "cross-site") return true
  if (!request.origin) return false
  try {
    return new URL(request.origin).host !== request.host
  } catch {
    // "null" (sandboxed iframes, file://) or garbage: treat as foreign.
    return true
  }
}
