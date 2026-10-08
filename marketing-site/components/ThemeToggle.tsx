"use client"

import { useState, useSyncExternalStore } from "react"
import { Monitor, Moon, Sun } from "lucide-react"
import { readStoredThemePreference, type ThemePreference } from "@/lib/theme"
import { chooseTheme } from "@/lib/theme-choice"
import { cn } from "@/lib/utils"

const noopSubscribe = () => () => {}
const useMounted = () => useSyncExternalStore(noopSubscribe, () => true, () => false)

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "system", label: "System", Icon: Monitor },
  { value: "dark", label: "Dark", Icon: Moon },
]

/** Compact Light/System/Dark control for the header (TPC UI ThemeToggle, icon form). */
export function ThemeToggle({ className }: { className?: string }) {
  const mounted = useMounted()
  const [pref, setPref] = useState<ThemePreference>(readStoredThemePreference)

  return (
    <div role="group" aria-label="Appearance" className={cn("inline-flex rounded-lg border border-border bg-panel p-0.5", className)}>
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = mounted && pref === value
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            aria-label={label}
            title={label}
            onClick={() => {
              setPref(value)
              chooseTheme(value)
            }}
            className={cn(
              "inline-flex min-h-11 min-w-11 items-center justify-center rounded-md transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-bg text-ink shadow-sm" : "text-muted-foreground hover:text-ink",
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        )
      })}
    </div>
  )
}
