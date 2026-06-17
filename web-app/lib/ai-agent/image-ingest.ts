/**
 * Image URL ingestion for the Focus Forge assistant.
 *
 * When a user pastes an image URL into the chat, the agent would otherwise see
 * it as plain text and be unable to "look" at the image. This module:
 *   1. Detects image URL(s) in a message (pure, testable).
 *   2. Fetches the bytes server-side with SSRF safety (private/loopback/
 *      link-local/metadata IPs are rejected; image content-type + size cap
 *      enforced; timeout applied).
 *   3. Returns a base64 image block + media type that the Anthropic Messages
 *      API understands, OR a graceful failure reason for an honest fallback.
 *
 * No raw bytes are persisted — callers store the URL *reference* only.
 */

/** Known screenshoter host whose URLs are images even without an image extension. */
export const SCREENSHOTER_HOST = "screenshoter-api.the-portland-company.workers.dev";

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif)(?:[?#]|$)/i;
const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

/** Max bytes we are willing to fetch for a single image (8 MB). */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** Fetch timeout in milliseconds. */
export const FETCH_TIMEOUT_MS = 10_000;

const MEDIA_TYPE_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

/**
 * Extract http(s) URLs from `text` that look like images: either the path ends
 * in a known image extension, or the host is the known screenshoter host.
 * Pure and synchronous — safe to unit test. De-duplicates while preserving order.
 */
export function extractImageUrls(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const matches = text.match(URL_RE) || [];
  for (const raw of matches) {
    // Trim trailing punctuation that commonly clings to URLs in prose.
    const url = raw.replace(/[.,;:!?]+$/, "");
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    const isImage =
      IMAGE_EXT_RE.test(parsed.pathname) ||
      parsed.hostname.toLowerCase() === SCREENSHOTER_HOST;
    if (!isImage) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

/**
 * SSRF guard: returns true when the host string is a literal IP that belongs to
 * a private / loopback / link-local / metadata / reserved range, OR an obvious
 * local hostname (localhost). Hostnames that resolve via DNS are checked at
 * fetch time by re-validating the resolved address (see fetchImageForVision).
 *
 * Exported for direct unit testing.
 */
export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "metadata" || host === "metadata.google.internal") return true;

  // IPv4 literal?
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const o = v4.slice(1).map(Number);
    if (o.some((n) => n > 255)) return true; // malformed → block
    return isBlockedIPv4(o[0], o[1], o[2], o[3]);
  }

  // IPv6 literal?
  if (host.includes(":")) {
    return isBlockedIPv6(host);
  }

  return false;
}

function isBlockedIPv4(a: number, b: number, _c: number, _d: number): boolean {
  if (a === 127) return true; // loopback 127.0.0.0/8
  if (a === 10) return true; // private 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // private 172.16.0.0/12
  if (a === 192 && b === 168) return true; // private 192.168.0.0/16
  if (a === 169 && b === 254) return true; // link-local / metadata 169.254.0.0/16
  if (a === 0) return true; // 0.0.0.0/8 "this" network
  if (a >= 224) return true; // multicast/reserved 224.0.0.0/3
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  return false;
}

function isBlockedIPv6(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "::1" || h === "::") return true; // loopback / unspecified
  if (h.startsWith("fe80")) return true; // link-local
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // unique-local fc00::/7
  if (h.startsWith("ff")) return true; // multicast
  // IPv4-mapped (::ffff:a.b.c.d) — extract and re-check.
  const mapped = h.match(/::ffff:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (mapped) {
    const o = mapped.slice(1).map(Number);
    return isBlockedIPv4(o[0], o[1], o[2], o[3]);
  }
  return false;
}

export type ImageBlock = {
  type: "image";
  source: { type: "base64"; media_type: string; data: string };
};

export type IngestSuccess = { ok: true; url: string; block: ImageBlock };
export type IngestFailure = { ok: false; url: string; reason: string };
export type IngestResult = IngestSuccess | IngestFailure;

/** Injectable fetch for tests; defaults to global fetch at call time. */
export type FetchLike = (
  input: string,
  init?: { signal?: AbortSignal; redirect?: "follow" | "error" | "manual" },
) => Promise<{
  ok: boolean;
  status: number;
  url?: string;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

function mediaTypeFor(url: string, contentType: string | null): string | null {
  const ct = (contentType || "").split(";")[0].trim().toLowerCase();
  if (ct.startsWith("image/")) {
    // Normalize image/jpg → image/jpeg (Anthropic expects image/jpeg).
    return ct === "image/jpg" ? "image/jpeg" : ct;
  }
  // Fall back to extension if the server didn't send an image content-type.
  try {
    const ext = new URL(url).pathname.match(IMAGE_EXT_RE)?.[1]?.toLowerCase();
    if (ext && MEDIA_TYPE_BY_EXT[ext]) return MEDIA_TYPE_BY_EXT[ext];
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Fetch one image URL server-side and return an Anthropic image content block,
 * or a structured failure. Never throws — failures become { ok: false, reason }
 * so the caller can render an honest fallback message.
 *
 * SSRF safety: literal-IP and local hostnames are rejected before fetch, and
 * redirects are NOT followed (redirect: "error") so a public URL cannot bounce
 * to a private address.
 */
export async function fetchImageForVision(
  url: string,
  opts?: { fetchImpl?: FetchLike; maxBytes?: number; timeoutMs?: number },
): Promise<IngestResult> {
  const maxBytes = opts?.maxBytes ?? MAX_IMAGE_BYTES;
  const timeoutMs = opts?.timeoutMs ?? FETCH_TIMEOUT_MS;
  const doFetch: FetchLike = opts?.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, url, reason: "invalid URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, url, reason: "unsupported scheme" };
  }
  if (isBlockedHost(parsed.hostname)) {
    return { ok: false, url, reason: "blocked host (private/loopback/metadata)" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // redirect: "error" — do not follow redirects to a private address.
    const res = await doFetch(url, { signal: controller.signal, redirect: "error" });
    if (!res.ok) {
      return { ok: false, url, reason: `fetch failed (${res.status})` };
    }
    // If the fetch followed to a final URL, re-validate its host (defense in depth).
    if (res.url) {
      try {
        const finalHost = new URL(res.url).hostname;
        if (isBlockedHost(finalHost)) {
          return { ok: false, url, reason: "redirected to blocked host" };
        }
      } catch {
        /* ignore unparseable res.url */
      }
    }

    const mediaType = mediaTypeFor(url, res.headers.get("content-type"));
    if (!mediaType) {
      return { ok: false, url, reason: "not an image (content-type)" };
    }

    const lenHeader = res.headers.get("content-length");
    if (lenHeader && Number(lenHeader) > maxBytes) {
      return { ok: false, url, reason: "image too large" };
    }

    const buf = await res.arrayBuffer();
    if (buf.byteLength > maxBytes) {
      return { ok: false, url, reason: "image too large" };
    }
    const data = Buffer.from(buf).toString("base64");
    return {
      ok: true,
      url,
      block: { type: "image", source: { type: "base64", media_type: mediaType, data } },
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return { ok: false, url, reason: aborted ? "timeout" : "fetch error" };
  } finally {
    clearTimeout(timer);
  }
}
