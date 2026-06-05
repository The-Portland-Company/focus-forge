/**
 * Utilities for trimming a plain-text email body down to just the newest,
 * author-written content — removing quoted prior-thread replies and signatures.
 *
 * This is intentionally conservative: it only truncates at high-confidence
 * markers so that legitimate message content is never lost. It is meant for
 * hover/preview text only, NOT for the full email view.
 */

// Quoted-reply attribution lines, e.g.
//   "On Mon, Jun 2, 2026 at 10:00 AM John Doe <john@x.com> wrote:"
//   "On 6/2/26, John Doe wrote:"
//   "El 2 jun 2026, a las 10:00, Juan escribió:"
//   "Le 2 juin 2026 à 10:00, Jean a écrit :"
//   "Am 02.06.2026 schrieb Max:"
const ATTRIBUTION_PATTERNS: RegExp[] = [
  /^\s*On\b.+\bwrote:\s*$/i,
  /^\s*On\b.+\bwrote:$/i, // trailing content after "wrote:" handled below
  /^\s*El\b.+\bescribi[oó]:\s*$/i,
  /^\s*Le\b.+\ba\s+[ée]crit\s*:\s*$/i,
  /^\s*Am\b.+\bschrieb.*:\s*$/i,
  /^\s*Il\b.+\bha\s+scritto:\s*$/i,
];

// A single line that, on its own, signals the start of quoted/forwarded
// content or a signature.
const HARD_MARKER_PATTERNS: RegExp[] = [
  // Signature delimiter per RFC 3676 ("-- " on its own line). Be lenient on
  // trailing whitespace since clients are inconsistent.
  /^--\s*$/,
  /^—\s*$/,
  // Original / forwarded message separators (English + common localized).
  /^-{2,}\s*Original Message\s*-{2,}\s*$/i,
  /^-{2,}\s*Forwarded message\s*-{2,}\s*$/i,
  /^_{5,}\s*$/, // Outlook draws a long underscore rule above quoted headers
  /^Begin forwarded message:\s*$/i,
  /^Mensaje original\s*$/i,
  // Mobile "Sent from" footers.
  /^Sent from my\b.*$/i,
  /^Get Outlook for\b.*$/i,
  /^Enviado desde mi\b.*$/i,
  // Quoted-header blocks (Outlook style) — the "From:" line that introduces
  // the prior message's headers.
  /^From:\s.+$/,
  /^De\s?:\s.+$/, // French/Spanish "From:"
  /^Von:\s.+$/, // German "From:"
];

// Common sign-offs that, when they appear as a short standalone line, indicate
// the body has ended and a signature follows. Matched only when the line is the
// sign-off optionally followed by a comma (e.g. "Best regards," / "Thanks").
const SIGNOFF_PATTERN =
  /^(?:thanks(?:\s+again)?|thank you|many thanks|cheers|best|best regards|kind regards|warm regards|regards|sincerely|respectfully|yours truly|yours sincerely|talk soon|all the best|take care|cordially|saludos|atentamente|cordialement|mit freundlichen gr[üu][ßs]en|gracias)[,!.]?\s*$/i;

/**
 * Returns true if `line` begins a quoted attribution ("On ... wrote:") even
 * when the wrote: is followed by inline quoted text on the same line.
 */
function isAttributionLine(line: string): boolean {
  if (ATTRIBUTION_PATTERNS.some((re) => re.test(line))) return true;
  // "On <stuff> wrote:" possibly with quoted text trailing on the same line.
  return /^\s*On\b.{0,400}\bwrote:/i.test(line);
}

function isHardMarker(line: string): boolean {
  return HARD_MARKER_PATTERNS.some((re) => re.test(line));
}

/**
 * Strip quoted prior-thread content and signatures from a plain-text email
 * body, keeping only the newest author-written portion.
 *
 * Conservative rules — truncate at the FIRST confident marker:
 *  - A quoted-reply attribution line ("On <date>, <person> wrote:", and
 *    French/Spanish/German/Italian equivalents).
 *  - The first line that starts a run of `>`-quoted lines.
 *  - A signature delimiter line ("-- " / "—").
 *  - Forwarded / original-message separators.
 *  - Mobile footers ("Sent from my iPhone", "Get Outlook for ...").
 *  - Outlook-style quoted header blocks ("From: ...", "De:", "Von:").
 *  - A standalone sign-off line ("Best regards,", "Thanks", etc.) — only when
 *    it is short and at least one non-empty line precedes it, so we never
 *    return empty content.
 *
 * If no confident marker is found, the original text is returned unchanged.
 */
export function stripQuotedAndSignature(input: string): string {
  if (!input) return input ?? "";

  const lines = input.split(/\r?\n/);
  let cutAt = -1;
  let seenContent = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    // A line starting with ">" begins quoted material.
    if (/^>/.test(line)) {
      cutAt = i;
      break;
    }

    if (isAttributionLine(raw) || isHardMarker(raw)) {
      cutAt = i;
      break;
    }

    // Sign-off: only cut if we already have content AND the following lines
    // look like a signature (short, no quoted markers immediately needed).
    if (seenContent && SIGNOFF_PATTERN.test(line)) {
      cutAt = i;
      break;
    }

    if (line.length > 0) {
      seenContent = true;
    }
  }

  if (cutAt === -1) {
    return input;
  }

  const kept = lines.slice(0, cutAt).join("\n").replace(/\s+$/g, "");
  // Never return empty if we had content — fall back to the original.
  if (!kept.trim() && seenContent) {
    return input;
  }
  return kept;
}
