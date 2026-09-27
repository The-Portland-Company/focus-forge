/**
 * Inbound sender authentication (SPF/DKIM/DMARC) verdicts.
 *
 * We do not do our own DNS lookups. The realistic path for an IMAP-based
 * client is to trust the `Authentication-Results` header the receiving mail
 * server already stamped on the message per RFC 8601, and interpret the
 * per-method results it records (RFC 7208 SPF, RFC 6376 DKIM, RFC 7489
 * DMARC).
 *
 * `Authentication-Results` can legally appear more than once (each hop may
 * add its own). Only the header added by the boundary MTA closest to us is
 * trustworthy — anything further out could have been forged by the sender.
 * Headers are prepended as they're added, so the header closest to us is the
 * one that appears first in the raw message. `raw_headers` collapses
 * same-named headers by joining their values with ", " (see
 * `normalizeHeaders` in provider.ts), so we split that joined string back
 * into segments and take the first one.
 *
 * Absence of the header (or a segment we can't parse) is recorded as
 * "unknown" — never silently treated as a pass.
 */

export type AuthMethodResult =
  | "pass"
  | "fail"
  | "softfail"
  | "neutral"
  | "none"
  | "temperror"
  | "permerror"
  | "unknown";

export interface SpfVerdict {
  result: AuthMethodResult;
  domain: string | null;
}

export interface DkimVerdict {
  result: AuthMethodResult;
  domain: string | null;
}

export interface DmarcVerdict {
  result: AuthMethodResult;
  domain: string | null;
  /** True when From-header domain aligns with the SPF and/or DKIM domain per DMARC (RFC 7489 §3.1). */
  aligned: boolean | null;
}

export interface AuthResultsVerdict {
  /**
   * "authenticated": DMARC passed with alignment.
   * "unauthenticated": we have a verdict and it did not pass DMARC.
   * "unknown": no usable Authentication-Results header was present.
   */
  status: "authenticated" | "unauthenticated" | "unknown";
  authServId: string | null;
  spf: SpfVerdict | null;
  dkim: DkimVerdict | null;
  dmarc: DmarcVerdict | null;
  /** Number of Authentication-Results header instances seen (0 if absent). */
  headerCount: number;
  raw: string | null;
}

const UNKNOWN_VERDICT: AuthResultsVerdict = {
  status: "unknown",
  authServId: null,
  spf: null,
  dkim: null,
  dmarc: null,
  headerCount: 0,
  raw: null,
};

const VALID_METHOD_RESULTS: ReadonlySet<string> = new Set([
  "pass",
  "fail",
  "softfail",
  "neutral",
  "none",
  "temperror",
  "permerror",
]);

function normalizeMethodResult(value: string | undefined | null): AuthMethodResult {
  const lowered = (value || "").trim().toLowerCase();
  return VALID_METHOD_RESULTS.has(lowered) ? (lowered as AuthMethodResult) : "unknown";
}

/**
 * `raw_headers` stores at most one string per header name; when the source
 * message had multiple `Authentication-Results` headers, normalizeHeaders()
 * joins their values with ", ". Split that back into the original per-header
 * segments. A segment boundary is a comma followed by what looks like the
 * start of a new `authserv-id;` — a token with no spaces, then `;`.
 */
export function splitAuthenticationResultsHeaders(joined: string): string[] {
  const trimmed = joined.trim();
  if (!trimmed) return [];
  const segments = trimmed.split(/,\s*(?=[A-Za-z0-9._-]+\s*;)/);
  return segments.map((segment) => segment.trim()).filter(Boolean);
}

/**
 * Parses a single `Authentication-Results` header value (everything after
 * the header name/colon) into per-method verdicts.
 */
export function parseAuthenticationResultsHeader(value: string): AuthResultsVerdict {
  const raw = value.trim();
  if (!raw) return { ...UNKNOWN_VERDICT };

  const firstSemicolon = raw.indexOf(";");
  const authServId = firstSemicolon === -1 ? raw.trim() || null : raw.slice(0, firstSemicolon).trim() || null;
  const body = firstSemicolon === -1 ? "" : raw.slice(firstSemicolon + 1);

  // authserv-id alone (e.g. "mx.example.com;") with no resinfo means "no
  // authentication was done" per RFC 8601 §2.2 — that's a real "none", not
  // absence of the header.
  if (!body.trim()) {
    return {
      status: "unauthenticated",
      authServId,
      spf: { result: "none", domain: null },
      dkim: { result: "none", domain: null },
      dmarc: { result: "none", domain: null, aligned: false },
      headerCount: 1,
      raw,
    };
  }

  const spf = extractMethod(body, "spf", ["smtp.mailfrom", "smtp.helo"]);
  const dkim = extractMethod(body, "dkim", ["header.d", "header.i"]);
  const dmarcMethod = extractMethod(body, "dmarc", ["header.from"]);

  const dmarc: DmarcVerdict | null = dmarcMethod
    ? {
        result: dmarcMethod.result,
        domain: dmarcMethod.domain,
        aligned: dmarcMethod.result === "unknown" ? null : dmarcMethod.result === "pass",
      }
    : null;

  const status: AuthResultsVerdict["status"] =
    dmarc?.result === "pass" && dmarc.aligned
      ? "authenticated"
      : spf || dkim || dmarc
        ? "unauthenticated"
        : "unknown";

  return {
    status,
    authServId,
    spf: spf ? { result: spf.result, domain: spf.domain } : null,
    dkim: dkim ? { result: dkim.result, domain: dkim.domain } : null,
    dmarc,
    headerCount: 1,
    raw,
  };
}

function extractMethod(
  body: string,
  method: "spf" | "dkim" | "dmarc",
  domainProps: string[],
): { result: AuthMethodResult; domain: string | null } | null {
  const methodRegex = new RegExp(`(?:^|[\\s;])${method}=([A-Za-z]+)`, "i");
  const match = body.match(methodRegex);
  if (!match) return null;

  const result = normalizeMethodResult(match[1]);

  let domain: string | null = null;
  for (const prop of domainProps) {
    const propRegex = new RegExp(`${prop.replace(".", "\\.")}=([^\\s;)]+)`, "i");
    const propMatch = body.match(propRegex);
    if (propMatch) {
      domain = propMatch[1].replace(/^@/, "");
      break;
    }
  }

  return { result, domain };
}

/**
 * Given the raw, per-header-name string map already stored per message
 * (`raw_headers`, lower-cased keys), returns the trusted verdict for the
 * message: the result parsed from the most-recently-added
 * Authentication-Results header, or "unknown" if none is present.
 */
export function resolveAuthResultsVerdict(
  rawHeaders: Record<string, string> | null | undefined,
): AuthResultsVerdict {
  const headerValue = rawHeaders?.["authentication-results"];
  if (!headerValue || !String(headerValue).trim()) {
    return { ...UNKNOWN_VERDICT };
  }

  const segments = splitAuthenticationResultsHeaders(String(headerValue));
  if (segments.length === 0) {
    return { ...UNKNOWN_VERDICT };
  }

  // Trust the header closest to us: the first segment (see module docblock).
  const verdict = parseAuthenticationResultsHeader(segments[0]);
  return { ...verdict, headerCount: segments.length };
}
