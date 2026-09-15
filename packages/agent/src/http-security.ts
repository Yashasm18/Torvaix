/**
 * Browser-facing request checks for the agent server.
 *
 * The web app reaches the agent only through its own server-side proxies, which send no
 * Origin header. A browser tab never needs to call the agent directly, so:
 * - an Origin that isn't the Torvaix web app means another website is calling from the
 *   user's browser (it could otherwise queue, approve and run shell commands);
 * - a Host that isn't loopback (or explicitly allowed) means a DNS-rebinding attempt.
 */

export const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Parse a comma-separated env value, falling back to `defaults` when unset or empty. */
export function parseList(value: string | undefined, defaults: string[]): string[] {
  const items = (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return items.length > 0 ? items : defaults;
}

/** Hostname part of a Host header, lowercased and without the port ("[::1]:3001" -> "[::1]"). */
export function hostnameOf(hostHeader: string): string {
  const host = hostHeader.trim().toLowerCase();
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    return end === -1 ? host : host.slice(0, end + 1);
  }
  return host.split(':')[0];
}

export type RequestVerdict = { ok: true } | { ok: false; reason: string };

export function checkBrowserRequest(
  headers: { origin?: string; host?: string },
  options: { allowedOrigins: string[]; allowedHosts: string[] }
): RequestVerdict {
  if (headers.host !== undefined) {
    const name = hostnameOf(headers.host);
    if (!LOOPBACK_HOSTS.has(name) && !options.allowedHosts.map((h) => h.toLowerCase()).includes(name)) {
      return { ok: false, reason: `Host "${name}" is not allowed. Add it to AGENT_ALLOWED_HOSTS if intended.` };
    }
  }
  if (headers.origin !== undefined && !options.allowedOrigins.includes(headers.origin)) {
    return { ok: false, reason: 'Cross-origin requests to the agent server are not allowed.' };
  }
  return { ok: true };
}
