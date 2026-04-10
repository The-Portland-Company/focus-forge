import {
  ThemePreset,
  THEME_PRESETS,
  DEFAULT_THEME_PRESET,
  DEFAULT_GRADIENT_THEME,
} from "./theme-constants";

let cleanupSystemThemeListener: (() => void) | null = null;

export function resolveThemePreset(
  themePreset: ThemePreset,
  prefersDark: boolean,
): Exclude<ThemePreset, "system"> {
  if (themePreset === "system") {
    return prefersDark ? "dark" : "light";
  }

  return themePreset;
}

function clearSystemThemeListener() {
  cleanupSystemThemeListener?.();
  cleanupSystemThemeListener = null;
}

function applyResolvedTheme(
  requestedThemePreset: ThemePreset,
  resolvedThemePreset: Exclude<ThemePreset, "system">,
  color?: string,
  animationsEnabled: boolean = true,
) {
  const root = document.documentElement;
  const theme = THEME_PRESETS[resolvedThemePreset];

  if (!theme) {
    console.warn(
      `Theme preset '${resolvedThemePreset}' not found, using default`,
    );
    return applyTheme(DEFAULT_THEME_PRESET, color, animationsEnabled);
  }

  Object.values(THEME_PRESETS).forEach((preset) => {
    if (!preset?.cssClass) return;

    preset.cssClass
      .split(" ")
      .filter((className) => className.trim())
      .forEach((className) => root.classList.remove(className));
  });

  if (theme.cssClass) {
    theme.cssClass
      .split(" ")
      .filter((className) => className.trim())
      .forEach((className) => root.classList.add(className));
  }

  root.setAttribute("data-theme", requestedThemePreset);
  root.setAttribute("data-resolved-theme", resolvedThemePreset);

  const themeColor = theme.allowsColorCustomization
    ? color || theme.defaultColor || DEFAULT_GRADIENT_THEME
    : theme.defaultColor || DEFAULT_GRADIENT_THEME;

  if (themeColor) {
    applyUserTheme(themeColor, animationsEnabled);
  }

  if (animationsEnabled) {
    root.classList.remove("no-animations");
  } else {
    root.classList.add("no-animations");
  }
}

export function applyTheme(
  themePreset: ThemePreset = DEFAULT_THEME_PRESET,
  color?: string,
  animationsEnabled: boolean = true,
) {
  clearSystemThemeListener();

  if (
    themePreset === "system" &&
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
  ) {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const applyCurrent = (prefersDark: boolean) =>
      applyResolvedTheme(
        "system",
        resolveThemePreset("system", prefersDark),
        color,
        animationsEnabled,
      );

    applyCurrent(mediaQuery.matches);

    const listener = (event: MediaQueryListEvent) => {
      applyCurrent(event.matches);
    };

    mediaQuery.addEventListener("change", listener);
    cleanupSystemThemeListener = () => {
      mediaQuery.removeEventListener("change", listener);
    };
    return;
  }

  applyResolvedTheme(
    themePreset,
    resolveThemePreset(themePreset, false),
    color,
    animationsEnabled,
  );
}

export function applyUserTheme(
  color: string,
  animationsEnabled: boolean = true,
) {
  const root = document.documentElement;
  let primaryColor = color;

  if (color.startsWith("linear-gradient")) {
    const matches = color.match(/#[A-Fa-f0-9]{6}/g);
    if (matches && matches.length > 0) {
      primaryColor = matches[0];
    }
  }

  root.style.setProperty("--user-profile-color", primaryColor);
  root.style.setProperty("--user-profile-gradient", color);
  root.style.setProperty("--theme-primary", primaryColor);
  root.style.setProperty("--theme-gradient", color);

  if (primaryColor.startsWith("#") && primaryColor.length === 7) {
    const hex = primaryColor.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
      root.style.setProperty("--user-profile-color-rgb", `${r}, ${g}, ${b}`);
      root.style.setProperty("--theme-primary-rgb", `${r}, ${g}, ${b}`);
    } else {
      root.style.setProperty("--user-profile-color-rgb", "234, 88, 12");
      root.style.setProperty("--theme-primary-rgb", "234, 88, 12");
    }
  } else {
    root.style.setProperty("--user-profile-color-rgb", "234, 88, 12");
    root.style.setProperty("--theme-primary-rgb", "234, 88, 12");
  }
}

export function hexToRgb(
  hex: string,
): { r: number; g: number; b: number } | null {
  if (!hex.startsWith("#") || hex.length !== 7) return null;

  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}
