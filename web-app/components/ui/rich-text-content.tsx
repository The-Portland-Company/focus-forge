"use client"

import { sanitizeRichText } from "@/lib/rich-text-sanitize"
import { cn } from "@/lib/utils"

interface RichTextContentProps {
  html?: string | null
  className?: string
}

export function RichTextContent({ html, className }: RichTextContentProps) {
  const safeHtml = sanitizeRichText(html)

  if (!safeHtml) return null

  return (
    <div
      className={cn("focus-forge-rich-content", className)}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  )
}
