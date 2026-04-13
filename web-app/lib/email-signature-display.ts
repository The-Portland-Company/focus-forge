export const DEFAULT_HIDE_EMAIL_SIGNATURES = true;

const EMAIL_SIGNATURE_DISPLAY_STORAGE_KEY =
  "focus-forge.hide-email-signatures";

type EmailSignatureContentParts = {
  bodyHtml?: string | null;
  signatureHtml?: string | null;
  bodyText?: string | null;
  signatureText?: string | null;
  hasSignature: boolean;
};

type VisibleLine = {
  raw: string;
  normalized: string;
  sourceIndex: number;
};

const HTML_SIGNATURE_REGEXES = [
  /<div[^>]+class=["'][^"']*gmail_signature[^"']*["'][^>]*>/i,
  /<div[^>]+data-smartmail=["']gmail_signature["'][^>]*>/i,
  /<div[^>]+class=["'][^"']*signature[^"']*["'][^>]*>/i,
  /<table[^>]+class=["'][^"']*signature[^"']*["'][^>]*>/i,
];

const DIRECT_SIGNATURE_MARKERS = new Set([
  "follow us!",
  "sent from my iphone",
  "sent from my ipad",
  "sent from my android",
  "sent with proton mail",
  "managing partner,",
]);

const SIGN_OFF_MARKERS = new Set([
  "sincerely",
  "sincerely,",
  "best",
  "best,",
  "best -",
  "best-",
  "regards",
  "regards,",
  "regards -",
  "regards-",
  "cheers",
  "cheers,",
  "cheers -",
  "cheers-",
  "thanks",
  "thanks,",
  "thanks -",
  "thanks-",
  "thank you",
  "thank you,",
  "thank you -",
  "thank you-",
]);

const QUOTED_REPLY_SINGLE_LINE_REGEXES = [
  /^on .+ wrote:$/i,
  /^begin forwarded message:?$/i,
  /^-+\s*original message\s*-+$/i,
  /^original message:?$/i,
];

const QUOTED_REPLY_HEADER_REGEX = /^(from|sent|to|cc|subject):\s+/i;
const CONTACT_LINE_REGEX =
  /(https?:\/\/|www\.|@[a-z0-9.-]+\.[a-z]{2,}|(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4})/i;
const ROLE_LINE_REGEX =
  /\b(partner|founder|president|owner|manager|director|coordinator|sales|support|marketing|operations|account|team|office|company|llc|inc|ltd|corp)\b/i;
const NAME_LINE_REGEX = /^[A-Z][A-Za-z.'’-]*(?:\s+[A-Z][A-Za-z.'’-]*){0,3}$/;

function getRelevantHtmlContent(content: string) {
  const bodyMatch = /<body\b[^>]*>/i.exec(content);
  const startIndex =
    bodyMatch && typeof bodyMatch.index === "number"
      ? bodyMatch.index + bodyMatch[0].length
      : 0;

  const closingBodyMatch = /<\/body>/i.exec(content.slice(startIndex));
  const endIndex =
    closingBodyMatch && typeof closingBodyMatch.index === "number"
      ? startIndex + closingBodyMatch.index
      : content.length;

  return {
    content: content.slice(startIndex, endIndex),
    offset: startIndex,
  };
}

function stripInvisibleHtmlBlocks(content: string) {
  return content
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}

function rewindHtmlSignatureIndex(content: string, index: number) {
  const tagMatches = [
    ...content
      .slice(0, index)
      .matchAll(/<(p|div|table|tr|td|section|blockquote)\b[^>]*>/gi),
  ];

  if (tagMatches.length === 0) {
    return index;
  }

  const lastTag = tagMatches[tagMatches.length - 1];
  return typeof lastTag.index === "number" ? lastTag.index : index;
}

function appendVisibleCharacter(
  visibleText: string[],
  sourceIndexes: number[],
  character: string,
  sourceIndex: number,
) {
  visibleText.push(character);
  sourceIndexes.push(sourceIndex);
}

function appendVisibleNewline(
  visibleText: string[],
  sourceIndexes: number[],
  sourceIndex: number,
) {
  if (visibleText.length === 0 || visibleText[visibleText.length - 1] === "\n") {
    return;
  }

  visibleText.push("\n");
  sourceIndexes.push(sourceIndex);
}

function buildVisibleTextWithSourceMap(
  content: string,
  hasHtml: boolean,
): { visibleText: string; sourceIndexes: number[] } {
  if (!hasHtml) {
    return {
      visibleText: content,
      sourceIndexes: Array.from({ length: content.length }, (_, index) => index),
    };
  }

  const visibleText: string[] = [];
  const sourceIndexes: number[] = [];
  let index = 0;

  while (index < content.length) {
    const character = content[index];

    if (character !== "<") {
      appendVisibleCharacter(visibleText, sourceIndexes, character, index);
      index += 1;
      continue;
    }

    const tagEnd = content.indexOf(">", index);
    if (tagEnd === -1) {
      break;
    }

    const tagContent = content.slice(index + 1, tagEnd).trim().toLowerCase();
    const tagName = tagContent
      .replace(/^\//, "")
      .split(/\s+/, 1)[0]
      .replace(/\/$/, "");

    if (
      tagName === "br" ||
      tagName === "p" ||
      tagName === "div" ||
      tagName === "li" ||
      tagName === "tr" ||
      tagName === "table" ||
      tagName === "section" ||
      tagName === "blockquote" ||
      tagName === "ul" ||
      tagName === "ol" ||
      /^h[1-6]$/.test(tagName)
    ) {
      appendVisibleNewline(visibleText, sourceIndexes, index);
    }

    index = tagEnd + 1;
  }

  return { visibleText: visibleText.join(""), sourceIndexes };
}

function extractVisibleLines(
  content: string,
  hasHtml: boolean,
): { lines: VisibleLine[]; contentLength: number } {
  const { visibleText, sourceIndexes } = buildVisibleTextWithSourceMap(
    content,
    hasHtml,
  );
  const rawLines = visibleText.split(/\n+/);
  const lines: VisibleLine[] = [];
  let cursor = 0;

  for (const rawLine of rawLines) {
    const lineStart = cursor;
    cursor += rawLine.length + 1;

    const trimmed = rawLine.trim();
    if (!trimmed) {
      continue;
    }

    const leadingWhitespace = rawLine.search(/\S/);
    const sourceIndex =
      leadingWhitespace >= 0 &&
      lineStart + leadingWhitespace < sourceIndexes.length
        ? sourceIndexes[lineStart + leadingWhitespace]
        : sourceIndexes[Math.min(lineStart, sourceIndexes.length - 1)] ?? 0;

    lines.push({
      raw: trimmed,
      normalized: trimmed.replace(/\s+/g, " ").trim().toLowerCase(),
      sourceIndex,
    });
  }

  return { lines, contentLength: content.length };
}

function isDirectSignatureMarker(line: VisibleLine) {
  return DIRECT_SIGNATURE_MARKERS.has(line.normalized);
}

function isSignOffMarker(line: VisibleLine) {
  return SIGN_OFF_MARKERS.has(line.normalized);
}

function isQuotedReplyLine(line: VisibleLine) {
  return (
    QUOTED_REPLY_HEADER_REGEX.test(line.raw) ||
    QUOTED_REPLY_SINGLE_LINE_REGEXES.some((regex) => regex.test(line.raw))
  );
}

function isLikelyNameLine(line: VisibleLine) {
  return (
    line.raw.length <= 48 &&
    !CONTACT_LINE_REGEX.test(line.raw) &&
    !ROLE_LINE_REGEX.test(line.raw) &&
    NAME_LINE_REGEX.test(line.raw)
  );
}

function isLikelySignatureSupportLine(line: VisibleLine) {
  return (
    isLikelyNameLine(line) ||
    CONTACT_LINE_REGEX.test(line.raw) ||
    ROLE_LINE_REGEX.test(line.raw)
  );
}

function hasQuotedReplyCluster(lines: VisibleLine[], index: number) {
  if (QUOTED_REPLY_SINGLE_LINE_REGEXES.some((regex) => regex.test(lines[index].raw))) {
    return true;
  }

  let headerCount = 0;

  for (let offset = index; offset < lines.length && offset < index + 6; offset += 1) {
    if (QUOTED_REPLY_HEADER_REGEX.test(lines[offset].raw)) {
      headerCount += 1;
    }
  }

  return headerCount >= 2;
}

function hasSignatureEvidenceBelow(lines: VisibleLine[], index: number) {
  let supportCount = 0;

  for (let offset = index + 1; offset < lines.length && offset <= index + 6; offset += 1) {
    const line = lines[offset];

    if (isQuotedReplyLine(line)) {
      return true;
    }

    if (isLikelySignatureSupportLine(line)) {
      supportCount += 1;
      if (supportCount >= 1 && isLikelyNameLine(line)) {
        return true;
      }
      if (supportCount >= 2) {
        return true;
      }
    }
  }

  return false;
}

function findVisibleBoundaryIndex(
  content: string,
  hasHtml: boolean,
): { sourceIndex: number; rewindToBlock: boolean } | null {
  const { lines, contentLength } = extractVisibleLines(content, hasHtml);
  if (lines.length < 2) {
    return null;
  }

  const minimumLineIndex = Math.max(1, Math.floor(lines.length * 0.25));
  const minimumSourceIndex = Math.floor(contentLength * 0.15);
  let boundary: { sourceIndex: number; rewindToBlock: boolean } | null = null;

  for (let index = lines.length - 1; index >= minimumLineIndex; index -= 1) {
    const line = lines[index];
    if (line.sourceIndex < minimumSourceIndex) {
      continue;
    }

    if (isQuotedReplyLine(line) && hasQuotedReplyCluster(lines, index)) {
      boundary = { sourceIndex: line.sourceIndex, rewindToBlock: hasHtml };
      continue;
    }

    if (isDirectSignatureMarker(line)) {
      boundary = { sourceIndex: line.sourceIndex, rewindToBlock: hasHtml };
      continue;
    }

    if (isSignOffMarker(line) && hasSignatureEvidenceBelow(lines, index)) {
      boundary = { sourceIndex: line.sourceIndex, rewindToBlock: hasHtml };
    }
  }

  return boundary;
}

function findExplicitHtmlSignatureIndex(content: string) {
  let foundIndex = -1;

  for (const regex of HTML_SIGNATURE_REGEXES) {
    const match = regex.exec(content);
    if (match && typeof match.index === "number") {
      foundIndex = foundIndex === -1 ? match.index : Math.min(foundIndex, match.index);
    }
  }

  return foundIndex;
}

function findSignatureMarkerIndex(content: string) {
  const hasHtml = /<[^>]+>/.test(content);
  const relevantHtml = hasHtml
    ? getRelevantHtmlContent(content)
    : { content, offset: 0 };
  const searchableContent = hasHtml
    ? stripInvisibleHtmlBlocks(relevantHtml.content)
    : relevantHtml.content;

  const explicitHtmlIndex = hasHtml
    ? findExplicitHtmlSignatureIndex(searchableContent)
    : -1;
  const visibleBoundary = findVisibleBoundaryIndex(searchableContent, hasHtml);

  const candidates = [
    explicitHtmlIndex >= 0
      ? { sourceIndex: explicitHtmlIndex, rewindToBlock: false }
      : null,
    visibleBoundary,
  ].filter(Boolean) as Array<{ sourceIndex: number; rewindToBlock: boolean }>;

  if (candidates.length === 0) {
    return -1;
  }

  const winner = candidates.reduce((best, current) =>
    current.sourceIndex < best.sourceIndex ? current : best,
  );

  const sourceIndex =
    hasHtml && winner.rewindToBlock
      ? rewindHtmlSignatureIndex(searchableContent, winner.sourceIndex)
      : winner.sourceIndex;

  return relevantHtml.offset + sourceIndex;
}

function normalizeContentPart(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function extractEmailSignatureContentParts(params: {
  html?: string | null;
  text?: string | null;
}): EmailSignatureContentParts {
  const html = params.html?.trim() || null;
  const text = params.text?.trim() || null;

  if (html) {
    const signatureIndex = findSignatureMarkerIndex(html);

    if (signatureIndex > 0) {
      return {
        bodyHtml: normalizeContentPart(html.slice(0, signatureIndex)),
        signatureHtml: normalizeContentPart(html.slice(signatureIndex)),
        bodyText: text,
        signatureText: null,
        hasSignature: true,
      };
    }
  }

  if (text && !html) {
    const signatureIndex = findSignatureMarkerIndex(text);

    if (signatureIndex > 0) {
      return {
        bodyHtml: null,
        signatureHtml: null,
        bodyText: normalizeContentPart(text.slice(0, signatureIndex)),
        signatureText: normalizeContentPart(text.slice(signatureIndex)),
        hasSignature: true,
      };
    }
  }

  return {
    bodyHtml: html,
    signatureHtml: null,
    bodyText: text,
    signatureText: null,
    hasSignature: false,
  };
}

function getStorageKey(userId?: string | null) {
  return userId
    ? `${EMAIL_SIGNATURE_DISPLAY_STORAGE_KEY}.${userId}`
    : EMAIL_SIGNATURE_DISPLAY_STORAGE_KEY;
}

export function loadHideEmailSignaturesPreference(userId?: string | null) {
  if (typeof window === "undefined") {
    return DEFAULT_HIDE_EMAIL_SIGNATURES;
  }

  const stored = window.localStorage.getItem(getStorageKey(userId));

  if (stored === "true") return true;
  if (stored === "false") return false;

  return DEFAULT_HIDE_EMAIL_SIGNATURES;
}

export function saveHideEmailSignaturesPreference(
  userId: string | null | undefined,
  hideEmailSignatures: boolean,
) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    getStorageKey(userId),
    hideEmailSignatures ? "true" : "false",
  );
}
