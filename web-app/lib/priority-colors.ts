/**
 * Priority colours, shared by tasks and email.
 *
 * Lifted out of components/task-list so email rows and the email context menu
 * colour their priority flags exactly like tasks do — including honouring the
 * user's profile `priorityColor`, which shades all four levels from one hue.
 */

export const PRIORITY_LEVELS = [1, 2, 3, 4] as const;
export type PriorityLevel = (typeof PRIORITY_LEVELS)[number];

export const PRIORITY_LABELS: Record<PriorityLevel, string> = {
  1: "Urgent",
  2: "High",
  3: "Medium",
  4: "Low",
};

export const getDefaultPriorityColors = () => ({
  1: "#ef4444", // red-500 - brightest (highest priority)
  2: "#f87171", // red-400
  3: "#fca5a5", // red-300
  4: "#fecaca", // red-200 - lightest (lowest priority)
});

// Standard priority colors for flag icons (distinct colors per level)
export const STANDARD_PRIORITY_FLAG_COLORS: Record<number, string> = {
  1: "#ef4444", // red - urgent
  2: "#f97316", // orange - high
  3: "#3b82f6", // blue - medium
  4: "#6b7280", // gray - low
};

// Generate priority colors based on a base hue
export const generatePriorityColors = (baseColor: string) => {
  // If it's a hex color, use it to generate shades
  if (baseColor.startsWith("#")) {
    // Convert hex to HSL to generate shades
    const hex = baseColor.replace("#", "");
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0,
      s = 0,
      l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
          break;
        case g:
          h = ((b - r) / d + 2) / 6;
          break;
        case b:
          h = ((r - g) / d + 4) / 6;
          break;
      }
    }

    // Generate 4 shades with same hue, varying saturation and lightness
    const hslToHex = (h: number, s: number, l: number) => {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
      const g = Math.round(hue2rgb(p, q, h) * 255);
      const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
      return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    };

    return {
      1: hslToHex(h, Math.min(s * 1.2, 1), 0.45), // brightest (highest priority)
      2: hslToHex(h, s, 0.55),
      3: hslToHex(h, s * 0.8, 0.65),
      4: hslToHex(h, s * 0.6, 0.75), // lightest (lowest priority)
    };
  }
  return getDefaultPriorityColors();
};


/**
 * The four flag colours to use for a given user preference: their own hue when
 * they have set one, the standard red/orange/blue/grey scale otherwise.
 */
export function getPriorityFlagColors(
  priorityColor?: string | null,
): Record<number, string> {
  return priorityColor
    ? generatePriorityColors(priorityColor)
    : STANDARD_PRIORITY_FLAG_COLORS;
}
