const DEVNOTES_META_PATTERN = /\[DEVNOTES_META:[^\]]+\]/g;

function cleanWhitespace(value: string) {
  return value
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export function extractDevnotesMeta(value?: string | null) {
  if (!value) {
    return null;
  }

  const matches = value.match(DEVNOTES_META_PATTERN);
  if (!matches?.length) {
    return null;
  }

  return matches.join("\n");
}

export function stripDevnotesMeta(value?: string | null) {
  if (!value) {
    return value ?? null;
  }

  const cleaned = cleanWhitespace(value.replace(DEVNOTES_META_PATTERN, ""));
  return cleaned || null;
}

export function normalizeProjectContentFields(input: {
  description?: string | null;
  devnotesMeta?: string | null;
  devnotes_meta?: string | null;
}) {
  const embeddedMeta = extractDevnotesMeta(input.description);
  const explicitMeta =
    typeof input.devnotesMeta === "string"
      ? input.devnotesMeta.trim()
      : typeof input.devnotes_meta === "string"
        ? input.devnotes_meta.trim()
        : "";

  const devnotesMeta = explicitMeta || embeddedMeta || null;
  const description =
    embeddedMeta && input.description !== undefined
      ? stripDevnotesMeta(input.description)
      : input.description ?? null;

  return {
    description,
    devnotesMeta,
  };
}
