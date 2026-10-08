"use client";

import { useState, useSyncExternalStore } from "react";
import { readStoredThemePreference, type ThemePreference } from "@/lib/theme";
import { chooseTheme } from "@/lib/theme-choice";
import { cn } from "@/lib/utils";

const noopSubscribe = () => () => {};
function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
  { value: "dark", label: "Dark" },
];

/** Segmented Light/System/Dark control. Writes both `tpc_theme` and `politogy_theme`. */
export function ThemeToggle() {
  const mounted = useMounted();
  const [pref, setPref] = useState<ThemePreference>(readStoredThemePreference);

  function choose(next: ThemePreference) {
    setPref(next);
    chooseTheme(next);
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">Appearance</span>
      <div role="group" aria-label="Appearance" className="inline-flex rounded-lg border border-line bg-panel p-0.5">
        {OPTIONS.map((opt) => {
          const active = mounted && pref === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              onClick={() => choose(opt.value)}
              className={cn(
                "min-h-11 min-w-11 rounded-md px-3 py-1 text-xs font-medium transition-colors duration-fast ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "bg-bg text-ink shadow-sm" : "text-muted-foreground hover:text-ink",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
