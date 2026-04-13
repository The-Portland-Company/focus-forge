"use client";

import parse from "html-react-parser";
import { sanitizeEmailHtml } from "@/lib/email-html-sanitize";
import { cn } from "@/lib/utils";

interface EmailHtmlContentProps {
  html?: string | null;
  className?: string;
}

export function EmailHtmlContent({
  html,
  className,
}: EmailHtmlContentProps) {
  const safeHtml = sanitizeEmailHtml(html);

  if (!safeHtml) return null;

  return (
    <div className={cn("focus-forge-email-content", className)}>
      {parse(safeHtml)}
    </div>
  );
}
