/**
 * Parse a timestamp from the agent server. SQLite's CURRENT_TIMESTAMP produces UTC with no
 * zone ("2026-09-14 16:10:20"), which `new Date()` would otherwise read as local time.
 */
export function parseServerTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null

  const iso = value.includes("T") ? value : value.replace(" ", "T")
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso)
  const date = new Date(hasZone ? iso : `${iso}Z`)

  return Number.isNaN(date.getTime()) ? null : date
}
