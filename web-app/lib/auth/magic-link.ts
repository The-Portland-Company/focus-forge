// Build the magic-link URL we email ourselves, from an admin
// generateLink({ type: 'magiclink' }) result. We deliberately do NOT use the
// returned `action_link` (it points at Supabase's own /auth/v1/verify endpoint
// and mailer domain). Instead we point straight at our own callback carrying
// the token_hash, which both the web callback (/auth/callback) and the iOS deep
// link (focusforge://auth-callback) already verify via verifyOtp.
//
// Works for both http(s) callback URLs and the custom app scheme, and preserves
// any query already present on redirectTo.
export function buildMagicLinkUrl(
  redirectTo: string,
  hashedToken: string,
  type: string = "magiclink",
): string {
  const sep = redirectTo.includes("?") ? "&" : "?";
  return (
    `${redirectTo}${sep}token_hash=${encodeURIComponent(hashedToken)}` +
    `&type=${encodeURIComponent(type)}`
  );
}

// A tiny in-memory sliding-window limiter. Per-instance only (serverless may
// run several), which is fine for the "modest" abuse ceiling we want on a
// self-sent email route — it caps a single hot instance without a datastore.
// The clock and store are injectable so the behavior is unit-testable.
export interface RateLimitOptions {
  max: number;
  windowMs: number;
  now?: () => number;
  store?: Map<string, number[]>;
}

const defaultStore = new Map<string, number[]>();

export function checkRateLimit(
  key: string,
  options: RateLimitOptions,
): { allowed: boolean; retryAfterMs: number } {
  const now = (options.now ?? Date.now)();
  const store = options.store ?? defaultStore;
  const windowStart = now - options.windowMs;

  const hits = (store.get(key) ?? []).filter((t) => t > windowStart);

  if (hits.length >= options.max) {
    const retryAfterMs = hits[0] + options.windowMs - now;
    store.set(key, hits);
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 0) };
  }

  hits.push(now);
  store.set(key, hits);
  return { allowed: true, retryAfterMs: 0 };
}
