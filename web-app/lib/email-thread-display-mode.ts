export type EmailThreadDisplayMode = "centered" | "docked-right" | "docked-bottom";

export const DEFAULT_EMAIL_THREAD_DISPLAY_MODE: EmailThreadDisplayMode =
  "centered";

export const EMAIL_THREAD_DISPLAY_MODE_STORAGE_KEY = "email-thread-display-mode";

export const EMAIL_THREAD_DISPLAY_MODE_OPTIONS: Array<{
  value: EmailThreadDisplayMode;
  label: string;
  description: string;
}> = [
  {
    value: "centered",
    label: "Centered Modal",
    description:
      "Open threads in a centered dialog over the app with a dimmed backdrop.",
  },
  {
    value: "docked-right",
    label: "Docked Right",
    description:
      "Pin the thread to a full-height panel on the right so you can keep working.",
  },
  {
    value: "docked-bottom",
    label: "Docked Bottom",
    description:
      "Pin the thread to a full-width panel along the bottom so you can keep working.",
  },
];

export function normalizeEmailThreadDisplayMode(
  value: unknown,
): EmailThreadDisplayMode {
  if (
    value === "centered" ||
    value === "docked-right" ||
    value === "docked-bottom"
  ) {
    return value;
  }

  return DEFAULT_EMAIL_THREAD_DISPLAY_MODE;
}

export function isDockedEmailThreadDisplayMode(mode: EmailThreadDisplayMode) {
  return mode === "docked-right" || mode === "docked-bottom";
}

/** Read the persisted default display mode from localStorage (client only). */
export function loadEmailThreadDisplayMode(): EmailThreadDisplayMode {
  if (typeof window === "undefined") {
    return DEFAULT_EMAIL_THREAD_DISPLAY_MODE;
  }

  return normalizeEmailThreadDisplayMode(
    window.localStorage.getItem(EMAIL_THREAD_DISPLAY_MODE_STORAGE_KEY),
  );
}

/** Persist the default display mode to localStorage (client only). */
export function saveEmailThreadDisplayMode(mode: EmailThreadDisplayMode) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    EMAIL_THREAD_DISPLAY_MODE_STORAGE_KEY,
    normalizeEmailThreadDisplayMode(mode),
  );
}
