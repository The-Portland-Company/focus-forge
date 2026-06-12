"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useUserProfile } from "@/lib/supabase/hooks";
import {
  applyTheme,
  getDatabaseThemePreset,
  normalizeDatabaseThemePreset,
  persistThemePreference,
} from "@/lib/theme-utils";
import type { ThemePreset } from "@/lib/theme-constants";

/**
 * Compact System / Dark / Light mode switch for the sidebar footer.
 *
 * Persists through the SAME path the Settings theme picker uses:
 *   applyTheme() for instant feedback, persistThemePreference() for localStorage,
 *   and updateProfile({ theme_preset }) (via useUserProfile) for the DB. This
 *   keeps it in sync with Settings and survives reload.
 *
 * Only the three canonical presets are offered. If the user's stored preset is
 * a fancy one (e.g. liquid-glass / neutral-*), none of the three is highlighted.
 */

type Mode = "system" | "dark" | "light";

const MODES: Array<{ mode: Mode; preset: ThemePreset; label: string; Icon: typeof Sun }> = [
  { mode: "system", preset: "system", label: "System", Icon: Monitor },
  { mode: "dark", preset: "dark", label: "Dark", Icon: Moon },
  { mode: "light", preset: "light", label: "Light", Icon: Sun },
];

function prefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export function ThemeModeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const { profile, updateProfile } = useUserProfile();
  // The active preset as we last applied/know it. Starts unknown until profile loads.
  const [activePreset, setActivePreset] = useState<ThemePreset | null>(null);
  const [pending, setPending] = useState<Mode | null>(null);

  // Reflect the current preset on mount / when the profile loads.
  useEffect(() => {
    if (profile?.theme_preset !== undefined) {
      setActivePreset(normalizeDatabaseThemePreset(profile.theme_preset));
    }
  }, [profile?.theme_preset]);

  const select = async (mode: Mode, preset: ThemePreset) => {
    if (pending) return;
    setActivePreset(preset);
    setPending(mode);

    // Instant feedback + localStorage, identical to Settings' handleAutoSave.
    const color = profile?.profile_color || undefined;
    const animations = profile?.animations_enabled ?? true;
    applyTheme(preset, color, animations);
    persistThemePreference(preset, profile?.id);

    try {
      if (updateProfile) {
        await updateProfile({
          theme_preset: getDatabaseThemePreset(preset, prefersDark()),
        });
      }
    } finally {
      setPending(null);
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="Color mode"
      className={`flex items-center gap-0.5 rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 dark:border-zinc-800 dark:bg-zinc-950/70 ${
        collapsed ? "flex-col" : ""
      }`}
    >
      {MODES.map(({ mode, preset, label, Icon }) => {
        const active = activePreset === preset;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            disabled={pending !== null}
            onClick={() => select(mode, preset)}
            className={`flex items-center justify-center rounded-md transition-colors ${
              collapsed ? "h-7 w-7" : "h-7 flex-1 px-1"
            } ${
              active
                ? "bg-[rgb(var(--theme-primary-rgb))] text-white shadow-sm"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed ? (
              <span className="ml-1.5 text-xs font-medium">{label}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
