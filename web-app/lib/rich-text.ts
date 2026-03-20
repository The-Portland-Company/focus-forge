const HTML_TAG_PATTERN = /<[^>]*>/g

const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")

export const richTextToPlainText = (value: string | null | undefined) => {
  if (!value) return ""

  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|blockquote|h[1-6])>/gi, "\n")
      .replace(HTML_TAG_PATTERN, " "),
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

export const hasRichTextContent = (value: string | null | undefined) =>
  richTextToPlainText(value).length > 0

export const getRichTextPreview = (
  value: string | null | undefined,
  maxLength = 180,
) => {
  const plainText = richTextToPlainText(value)
  if (plainText.length <= maxLength) return plainText
  return `${plainText.slice(0, maxLength).trimEnd()}...`
}
