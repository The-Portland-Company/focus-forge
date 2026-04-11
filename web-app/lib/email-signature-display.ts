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

const HTML_SIGNATURE_REGEXES = [
  /<div[^>]+class=["'][^"']*gmail_signature[^"']*["'][^>]*>/i,
  /<div[^>]+data-smartmail=["']gmail_signature["'][^>]*>/i,
  /<div[^>]+class=["'][^"']*signature[^"']*["'][^>]*>/i,
  /<table[^>]+class=["'][^"']*signature[^"']*["'][^>]*>/i,
];

const SIGNATURE_MARKERS = [
  "follow us!",
  "sincerely,",
  "best,",
  "regards,",
  "cheers,",
  "thanks,",
  "thank you,",
  "sent from my iphone",
  "sent from my ipad",
  "sent from my android",
  "sent with proton mail",
  "managing partner,",
];

function getSignatureSearchStart(content: string) {
  return Math.min(
    Math.max(12, Math.floor(content.length * 0.05)),
    Math.max(24, content.length - 24),
  );
}

function buildVisibleTextIndexMap(content: string) {
  let visibleText = "";
  const htmlIndexes: number[] = [];
  let insideTag = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];

    if (character === "<") {
      insideTag = true;
      continue;
    }

    if (character === ">") {
      insideTag = false;
      continue;
    }

    if (insideTag) {
      continue;
    }

    visibleText += character.toLowerCase();
    htmlIndexes.push(index);
  }

  return { visibleText, htmlIndexes };
}

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
  const tagMatches = [...content.slice(0, index).matchAll(/<(p|div|table|tr|td|section)\b[^>]*>/gi)];

  if (tagMatches.length === 0) {
    return index;
  }

  const lastTag = tagMatches[tagMatches.length - 1];
  return typeof lastTag.index === "number" ? lastTag.index : index;
}

function findSignatureMarkerIndex(content: string) {
  const hasHtml = /<[^>]+>/.test(content);
  const relevantHtml = hasHtml
    ? getRelevantHtmlContent(content)
    : { content, offset: 0 };
  const searchableContent = hasHtml
    ? stripInvisibleHtmlBlocks(relevantHtml.content)
    : relevantHtml.content;
  const normalized = searchableContent.toLowerCase();
  const minIndex = hasHtml
    ? Math.min(512, Math.max(24, normalized.length - 24))
    : getSignatureSearchStart(normalized);
  let foundIndex = -1;
  let foundViaExplicitSignatureTag = false;

  for (const regex of HTML_SIGNATURE_REGEXES) {
    const match = regex.exec(searchableContent);
    if (match && match.index >= minIndex) {
      foundIndex =
        foundIndex === -1 ? match.index : Math.min(foundIndex, match.index);
      foundViaExplicitSignatureTag = true;
    }
  }

  for (const marker of SIGNATURE_MARKERS) {
    const markerIndex = normalized.indexOf(marker, minIndex);
    if (markerIndex >= 0) {
      foundIndex =
        foundIndex === -1 ? markerIndex : Math.min(foundIndex, markerIndex);
    }
  }

  if (hasHtml) {
    const { visibleText, htmlIndexes } =
      buildVisibleTextIndexMap(searchableContent);
    const visibleMinIndex = getSignatureSearchStart(visibleText);

    for (const marker of SIGNATURE_MARKERS) {
      const markerIndex = visibleText.indexOf(marker, visibleMinIndex);

      if (markerIndex >= 0) {
        const htmlIndex = htmlIndexes[markerIndex];

        if (typeof htmlIndex === "number") {
          foundIndex =
            foundIndex === -1 ? htmlIndex : Math.min(foundIndex, htmlIndex);
        }
      }
    }
  }

  if (
    foundIndex >= 0 &&
    !foundViaExplicitSignatureTag &&
    hasHtml
  ) {
    return (
      relevantHtml.offset +
      rewindHtmlSignatureIndex(searchableContent, foundIndex)
    );
  }

  return foundIndex >= 0 ? relevantHtml.offset + foundIndex : foundIndex;
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
