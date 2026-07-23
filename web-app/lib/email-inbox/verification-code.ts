// Best-effort extraction of a verification / OTP code from an email's subject
// and (optional) preview/body text. Designed to be conservative: we only
// surface a code when we are reasonably confident it is an OTP, to avoid
// turning years, prices, phone numbers, or order numbers into copy pills.

const KEYWORDS = [
  "verification code",
  "verification",
  "one-time",
  "one time",
  "onetime",
  "passcode",
  "pass code",
  "security code",
  "login code",
  "sign-in code",
  "sign in code",
  "access code",
  "confirmation code",
  "confirm",
  "auth code",
  "authentication code",
  "2fa",
  "otp",
  "code",
  "pin",
];

// Patterns that strongly indicate a code with the value captured in group 1.
// Ordered by confidence — earlier matches win.
const STRONG_PATTERNS: RegExp[] = [
  // Google-style "G-123456"
  /\bG-(\d{4,8})\b/,
  // "your verification code is 123456", "verification code: 123456"
  /(?:verification|security|login|sign[\s-]?in|access|confirmation|auth(?:entication)?|one[\s-]?time|passcode|pass\s?code|otp)\s*(?:code|password|pin)?\s*(?:is|:|=|->)?\s*[:\-]?\s*([A-Z0-9]{4,8})\b/i,
  // "code is 123456", "code: 123456", "code 123456"
  /\bcode\b\s*(?:is|:|=)?\s*[:\-]?\s*([A-Z0-9]{4,8})\b/i,
  // "OTP 1234", "OTP: 1234"
  /\botp\b\s*(?:is|:|=)?\s*[:\-]?\s*(\d{4,8})\b/i,
  // "PIN: 1234"
  /\bpin\b\s*(?:is|:|=)?\s*[:\-]?\s*(\d{4,8})\b/i,
  // "use 123456 to verify / to sign in / to confirm / to log in"
  /\b(?:use|enter)\s+([A-Z0-9]{4,8})\b[^.]{0,40}?\b(?:to\s+(?:verify|sign|log|confirm|continue|authenticate)|verify|confirm)/i,
  // "123456 is your ... code"
  /\b([A-Z0-9]{4,8})\b\s+is\s+your\b[^.]{0,40}?\b(?:code|otp|passcode|password|pin)/i,
];

function looksLikeYear(value: string): boolean {
  return /^(19|20)\d{2}$/.test(value);
}

function isAllDigits(value: string): boolean {
  return /^\d+$/.test(value);
}

function isAlphanumericMix(value: string): boolean {
  return /[A-Z]/i.test(value) && /\d/.test(value);
}

// A standalone token is a plausible code only if it is digit-heavy enough and
// not obviously a year. Alphanumeric tokens must contain at least one digit.
function isPlausibleStandaloneCode(value: string): boolean {
  if (value.length < 4 || value.length > 8) return false;
  if (looksLikeYear(value)) return false;
  // Reject the fractional-seconds tail of an ISO 8601 timestamp — e.g. the
  // "281Z" in "2026-07-23T19:01:45.281Z" is not a verification code.
  if (/^\d+Z$/i.test(value)) return false;
  if (isAllDigits(value)) return true;
  // 6-char alphanumeric-style codes must mix letters and digits to qualify.
  return isAlphanumericMix(value);
}

function hasKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return KEYWORDS.some((kw) => lower.includes(kw));
}

function cleanCode(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * Extract the most likely verification/OTP code from the given subject and/or
 * body text. Returns the code (uppercased, dashes/spaces stripped) or null when
 * no confident match is found.
 *
 * NOTE: Most OTP emails place the code in the subject or first preview line, so
 * passing `subject` + `previewText` is usually sufficient. If the code only
 * lives deep in the HTML body (not in the inbox payload), it will not be found.
 */
export function extractVerificationCode(
  subject: string | null | undefined,
  bodyText: string | null | undefined,
): string | null {
  const subjectText = (subject ?? "").trim();
  const body = (bodyText ?? "").trim();
  // Subject is the highest-signal field; check it first, then the body.
  const sources = [subjectText, body].filter(Boolean);

  // Pass 1: strong, keyword-anchored patterns across each source.
  for (const source of sources) {
    for (const pattern of STRONG_PATTERNS) {
      const match = source.match(pattern);
      if (match && match[1]) {
        const candidate = cleanCode(match[1]);
        if (looksLikeYear(candidate)) continue;
        if (candidate.length < 4 || candidate.length > 8) continue;
        // OTP codes always contain at least one digit; reject pure words
        // (e.g. "code section", "code below").
        if (!/\d/.test(candidate)) continue;
        return candidate;
      }
    }
  }

  // Pass 2: standalone numeric/alphanumeric token, but only when a keyword is
  // present somewhere in the combined text (keeps us conservative).
  const combined = sources.join("\n");
  if (!hasKeyword(combined)) return null;

  // Prefer tokens that appear near a keyword. We scan token-by-token and score
  // proximity to any keyword occurrence.
  const tokenRegex = /\b([A-Z0-9]{4,8})\b/gi;
  const lowerCombined = combined.toLowerCase();
  const keywordPositions: number[] = [];
  for (const kw of KEYWORDS) {
    let idx = lowerCombined.indexOf(kw);
    while (idx !== -1) {
      keywordPositions.push(idx);
      idx = lowerCombined.indexOf(kw, idx + 1);
    }
  }

  let best: { code: string; distance: number; allDigits: boolean } | null =
    null;
  let m: RegExpExecArray | null;
  while ((m = tokenRegex.exec(combined)) !== null) {
    const raw = m[1];
    if (!isPlausibleStandaloneCode(raw.toUpperCase())) continue;
    const pos = m.index;
    const distance = keywordPositions.length
      ? Math.min(...keywordPositions.map((kp) => Math.abs(kp - pos)))
      : Number.POSITIVE_INFINITY;
    // Only accept tokens reasonably close to a keyword (within ~60 chars).
    if (distance > 60) continue;
    const code = cleanCode(raw);
    const allDigits = isAllDigits(code);
    if (
      !best ||
      distance < best.distance ||
      // Tie-break: prefer purely numeric codes.
      (distance === best.distance && allDigits && !best.allDigits)
    ) {
      best = { code, distance, allDigits };
    }
  }

  return best ? best.code : null;
}
