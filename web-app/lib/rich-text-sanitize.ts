import DOMPurify from "isomorphic-dompurify"
import { hasRichTextContent } from "@/lib/rich-text"

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "ul",
  "ol",
  "li",
  "blockquote",
  "code",
  "pre",
  "a",
]

const ALLOWED_ATTR = ["href", "target", "rel"]

export const sanitizeRichText = (value: string | null | undefined) => {
  if (!value) return ""

  return DOMPurify.sanitize(value, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS: ["style", "script"],
    FORBID_ATTR: ["style", "onerror", "onload"],
  })
}

export const normalizeRichText = (value: string | null | undefined) => {
  const sanitized = sanitizeRichText(value)
  return hasRichTextContent(sanitized) ? sanitized : null
}
