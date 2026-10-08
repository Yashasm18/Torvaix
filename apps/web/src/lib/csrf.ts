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

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"])

/** Hostname part of a Host header, lowercased and without the port ("[::1]:3000" -> "[::1]"). */
export function hostnameOf(hostHeader: string): string {
  const host = hostHeader.trim().toLowerCase()
  if (host.startsWith("[")) {
    const end = host.indexOf("]")
    return end === -1 ? host : host.slice(0, end + 1)
  }
  return host.split(":")[0]
}

/** Extra host names from WEB_ALLOWED_HOSTS (comma-separated), lowercased and without ports. */
export function parseAllowedHosts(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => hostnameOf(entry))
    .filter(Boolean)
}

/**
 * True when the request was addressed to this computer, or to a name the user allowed.
 *
 * The same-origin check above is not enough on its own. In a DNS-rebinding attack a page loaded
 * from evil.example re-points that name at 127.0.0.1 and then calls our API: Origin and Host
 * are both evil.example, so it looks same-origin. The agent server checks Host too, but it only
 * ever sees requests from this app's own server, so the check has to happen here as well.
 */
export function isAllowedHost(hostHeader: string | null, allowedHosts: string[]): boolean {
  if (!hostHeader) return false
  const name = hostnameOf(hostHeader)
  // Browsers resolve every *.localhost name to this computer, so those can't be re-pointed.
  return LOOPBACK_HOSTS.has(name) || name.endsWith(".localhost") || allowedHosts.includes(name)
}
