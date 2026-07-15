"use client";

import parse from "html-react-parser";
import { sanitizeEmailHtml } from "@/lib/email-html-sanitize";
import { cn } from "@/lib/utils";

interface EmailHtmlContentProps {
  html?: string | null;
  className?: string;
  /** Content-ID -> download URL map for inline (cid:) images. */
  cidMap?: Record<string, string>;
}

export function EmailHtmlContent({
  html,
  className,
  cidMap,
}: EmailHtmlContentProps) {
  const safeHtml = sanitizeEmailHtml(html, { cidMap });

  if (!safeHtml) return null;

  // Render email HTML on a light surface so sender-defined colors (or the
  // absence of any color, which would otherwise inherit the dark app text on a
  // dark background) always have readable contrast. This preserves sender
  // formatting/images while guaranteeing legibility on the dark theme.
  return (
    <div
      className={cn(
        "focus-forge-email-content rounded-lg bg-white p-4 text-zinc-900",
        className,
      )}
    >
      {parse(safeHtml)}
    </div>
  );
}
