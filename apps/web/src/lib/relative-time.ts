const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
]

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })

/** "just now", "5 minutes ago", "yesterday"... for a past (or future) date. */
export function formatRelativeTime(date: Date | string | number | null | undefined, now: number = Date.now()): string {
  if (date == null) return "—"
  const ms = new Date(date).getTime()
  if (Number.isNaN(ms)) return "—"
  const diff = ms - now
  if (Math.abs(diff) < 60 * 1000) return "just now"
  for (const [unit, unitMs] of UNITS) {
    if (Math.abs(diff) >= unitMs) return rtf.format(Math.round(diff / unitMs), unit)
  }
  return "just now"
}
