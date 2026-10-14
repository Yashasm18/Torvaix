import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import { THEMES, isLightTheme } from "../themes"

const appDir = join(__dirname, "..", "..", "app")
const themesCss = readFileSync(join(appDir, "themes.css"), "utf8")
const globalsCss = readFileSync(join(appDir, "globals.css"), "utf8")

/** The custom properties a theme's block sets. */
function tokensOf(id: string): Record<string, string> {
  const start = themesCss.search(new RegExp(`\\[data-theme="${id}"\\] \\{`))
  if (start === -1) return {}
  const body = themesCss.slice(themesCss.indexOf("{", start) + 1, themesCss.indexOf("}", start))
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
}

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const TOKENS = [
  "background", "foreground", "surface", "card", "card-foreground", "popover", "popover-foreground", "primary", "primary-foreground",
  "secondary", "secondary-foreground", "muted", "muted-foreground", "accent", "accent-foreground", "destructive", "destructive-foreground",
  "border", "input", "ring", "sidebar-background", "sidebar-foreground", "sidebar-primary", "sidebar-primary-foreground",
  "sidebar-accent", "sidebar-accent-foreground", "sidebar-border", "sidebar-ring", "chart-1", "chart-2", "chart-3", "chart-4", "chart-5",
]

describe("themes", () => {
  it("has unique ids", () => {
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length)
  })

  it.each(THEMES.map((t) => [t.id]))("%s sets every colour the app uses", (id) => {
    const tokens = tokensOf(id)
    for (const token of TOKENS) expect(tokens[token], `--${token}`).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  // WCAG AA: 4.5:1 for text. Buttons' text too; 3:1 for large or non-text parts.
  it.each(THEMES.map((t) => [t.id]))("%s has readable text", (id) => {
    const c = tokensOf(id)
    expect(contrast(c.foreground, c.background)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(c["card-foreground"], c.card)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(c["muted-foreground"], c.background)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(c["muted-foreground"], c.card)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(c["primary-foreground"], c.primary)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(c["sidebar-foreground"], c["sidebar-background"])).toBeGreaterThanOrEqual(4.5)
    expect(contrast(c["sidebar-accent-foreground"], c["sidebar-accent"])).toBeGreaterThanOrEqual(4.5)
    expect(contrast(c.primary, c.background)).toBeGreaterThanOrEqual(3)
    expect(contrast(c["destructive-foreground"], c.destructive)).toBeGreaterThanOrEqual(3)
  })

  it("gives each light theme light form controls, darker status colours and no dark: styles", () => {
    const light = THEMES.filter((t) => t.mode === "light").map((t) => t.id)
    const remap = themesCss.slice(themesCss.indexOf("Status colours"))
    const darkVariant = globalsCss.match(/@custom-variant dark \((.*)\);/)?.[1] ?? ""
    for (const t of THEMES) {
      const block = themesCss.slice(themesCss.search(new RegExp(`\\[data-theme="${t.id}"\\] \\{`)))
      expect(block).toMatch(new RegExp(`^[^}]*color-scheme: ${t.mode};`))
      expect(remap.includes(`[data-theme="${t.id}"]`)).toBe(t.mode === "light")
      expect(darkVariant.includes(`[data-theme="${t.id}"]`)).toBe(t.mode === "light")
    }
    expect(light.length).toBeGreaterThan(1)
  })

  it("knows which themes are light", () => {
    expect(isLightTheme("sakura")).toBe(true)
    expect(isLightTheme("tokyo-night")).toBe(false)
    expect(isLightTheme(undefined)).toBe(false)
  })
})
