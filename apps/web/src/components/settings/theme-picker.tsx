"use client"

import { Check, Monitor } from "lucide-react"
import { useTheme } from "next-themes"

import { SYSTEM_THEME, THEMES, type ThemeInfo } from "@/lib/themes"
import { cn } from "@/lib/utils"

/**
 * A theme as a small piece of the app drawn in its own colours. The preview sets data-theme on
 * itself, so it uses the theme's real colours from themes.css rather than an approximation.
 */
function ThemeCard({ theme, selected, onSelect }: { theme: ThemeInfo; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "group text-left rounded-xl border p-2 transition-colors focus-visible:outline-2 focus-visible:outline-ring",
        selected ? "border-primary ring-1 ring-primary" : "border-border hover:border-muted-foreground/50"
      )}
    >
      <div
        data-theme={theme.id}
        aria-hidden
        className="rounded-lg border border-border bg-background text-foreground overflow-hidden flex h-20"
      >
        <div className="w-1/4 bg-sidebar border-r border-sidebar-border p-1.5 flex flex-col gap-1">
          <div className="h-1.5 rounded-full bg-primary w-3/4" />
          <div className="h-1.5 rounded-full bg-muted w-full" />
          <div className="h-1.5 rounded-full bg-muted w-2/3" />
        </div>
        <div className="flex-1 p-2 flex flex-col gap-1.5">
          <div className="text-[10px] font-semibold leading-none">Aa</div>
          <div className="rounded-md bg-surface border border-border px-1.5 py-1 text-[9px] leading-tight text-muted-foreground truncate">
            How can I help?
          </div>
          <div className="flex items-center gap-1 mt-auto">
            <span className="h-3 px-1.5 rounded bg-primary text-primary-foreground text-[8px] leading-3 font-semibold">Send</span>
            <span className="h-2 w-2 rounded-full" style={{ background: theme.swatches[3] }} />
            <span className="h-2 w-2 rounded-full" style={{ background: theme.swatches[4] }} />
          </div>
        </div>
      </div>
      <div className="mt-2 px-1 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{theme.name}</div>
          <div className="text-xs text-muted-foreground line-clamp-2">{theme.description}</div>
        </div>
        {selected && <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" aria-hidden />}
      </div>
    </button>
  )
}

export function ThemePicker() {
  const { theme, setTheme } = useTheme()
  const groups: { label: string; mode: ThemeInfo["mode"] }[] = [
    { label: "Light", mode: "light" },
    { label: "Dark", mode: "dark" },
  ]
  const credits = [...new Set(THEMES.map((t) => t.credit).filter(Boolean))]

  return (
    <div className="space-y-6">
      <button
        type="button"
        role="radio"
        aria-checked={theme === SYSTEM_THEME}
        onClick={() => setTheme(SYSTEM_THEME)}
        className={cn(
          "w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-colors",
          theme === SYSTEM_THEME ? "border-primary ring-1 ring-primary" : "border-border hover:border-muted-foreground/50"
        )}
      >
        <Monitor className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Match my computer</div>
          <div className="text-xs text-muted-foreground">Torvaix Light or Torvaix Dark, following your system setting.</div>
        </div>
        {theme === SYSTEM_THEME && <Check className="h-4 w-4 text-primary shrink-0" aria-hidden />}
      </button>

      {groups.map((group) => (
        <section key={group.mode} aria-label={`${group.label} themes`}>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">{group.label}</h4>
          <div role="radiogroup" aria-label={`${group.label} themes`} className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {THEMES.filter((t) => t.mode === group.mode).map((t) => (
              <ThemeCard key={t.id} theme={t} selected={theme === t.id} onSelect={() => setTheme(t.id)} />
            ))}
          </div>
        </section>
      ))}

      <p className="text-xs text-muted-foreground">
        Based on the open-source palettes of {credits.join(", ")}. Sakura, Sakura Night, Cyberpunk, Aurora and Terminal are Torvaix&apos;s own.
      </p>
    </div>
  )
}
