/**
 * Email shape check without a backtracking regex (the previous
 * /^[^\s@]+@[^\s@]+\.[^\s@]+$/ was flagged as polynomial ReDoS on crafted input).
 * Deliberately permissive: one "@", non-empty local part, a dot inside the domain, no whitespace.
 */
export function isValidEmail(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 254) return false;
  if (/\s/.test(value)) return false;

  const at = value.indexOf('@');
  if (at <= 0 || at !== value.lastIndexOf('@')) return false;

  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  return local.length <= 64 && dot > 0 && dot < domain.length - 1;
}
