export type EmailHtmlRenderMode = "preserve" | "simplified";

export const DEFAULT_EMAIL_HTML_RENDER_MODE: EmailHtmlRenderMode = "preserve";

export const EMAIL_HTML_RENDER_MODE_OPTIONS: Array<{
  value: EmailHtmlRenderMode;
  label: string;
  description: string;
}> = [
  {
    value: "preserve",
    label: "Preserve Original Email Layout",
    description: "Keep sender HTML layout, tables, and image sizing intact.",
  },
  {
    value: "simplified",
    label: "Simplified App View",
    description: "Flatten email HTML into the app's normal text-first styling.",
  },
];

export function normalizeEmailHtmlRenderMode(
  value: unknown,
): EmailHtmlRenderMode {
  return value === "simplified"
    ? "simplified"
    : DEFAULT_EMAIL_HTML_RENDER_MODE;
}

export function getEmailHtmlRenderModeToggleLabel(
  mode: EmailHtmlRenderMode,
) {
  return mode === "preserve"
    ? "Simplified App View"
    : "Preserve Original Layout";
}
