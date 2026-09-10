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

const DEVNOTES_META_TOKEN = /\[DEVNOTES_META:([^\]]+)\]/;

/**
 * Decode the base64 JSON payload embedded in a `[DEVNOTES_META:...]` token.
 * The token may be passed on its own or embedded in a task description. Returns
 * the parsed object, or null when there is no valid token. Never throws.
 */
export function decodeDevnotesMeta(
  value?: string | null,
): Record<string, unknown> | null {
  if (!value) return null;
  const match = DEVNOTES_META_TOKEN.exec(value);
  if (!match?.[1]) return null;
  try {
    const json = Buffer.from(match[1], "base64").toString("utf8");
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function normalizeProjectContentFields(input: {
  description?: string | null;
  devnotesMeta?: string | null;
  devnotes_meta?: string | null;
}) {
  return normalizeDevnotesContentFields(input);
}

export function normalizeTaskContentFields(input: {
  description?: string | null;
  devnotesMeta?: string | null;
  devnotes_meta?: string | null;
}) {
  return normalizeDevnotesContentFields(input);
}

function normalizeDevnotesContentFields(input: {
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
