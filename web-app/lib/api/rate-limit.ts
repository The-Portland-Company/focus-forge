/**
 * Reusable per-token rate limiter for API routes authenticated by a PAT or
 * user id — primarily `/api/mobile/*` and `/api/mcp`. OWASP AI Agent
 * Security Cheat Sheet §5/§8: bound how fast a single credential can drive
 * the agent, independent of the per-session ceilings in `budget.ts`.
 *
 * Same storage approach as the one existing limiter in this codebase
 * (`lib/auth/magic-link.ts`'s `checkRateLimit`): an in-memory sliding window,
 * per-instance, with an injectable clock/store for unit tests. No new
 * dependency and no DB table — the existing limiter doesn't use one either,
 * and a per-instance limiter is the established pattern here (serverless
 * scale-out means this caps each hot instance rather than being globally
 * exact, which is the same tradeoff the existing limiter accepts).
 *
 * Not wired into any route yet (out of scope for this change) — see the
 * adoption notes in the PR/report for where the mobile and MCP route
 * handlers should call `checkTokenRateLimit`.
 */

export interface TokenRateLimitOptions {
  /** Max requests allowed within the window. */
  max: number;
  /** Sliding window size, in ms. */
  windowMs: number;
  now?: () => number;
  store?: Map<string, number[]>;
}

export interface TokenRateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

const defaultStore = new Map<string, number[]>();

/** Default ceiling for authenticated per-token API traffic (mobile/MCP). */
export const DEFAULT_TOKEN_RATE_LIMIT: Omit<TokenRateLimitOptions, "now" | "store"> = {
  max: 60,
  windowMs: 60 * 1000,
};

/**
 * Sliding-window rate limit keyed by an arbitrary identity string (PAT id or
 * user id, plus a namespace prefix so different routes don't share a bucket).
 * Fails CLOSED: any error while reading/writing the store denies the request
 * rather than letting it through, per OWASP §5/§8 (never fail open on a
 * resource-exhaustion control).
 */
export function checkTokenRateLimit(
  key: string,
  options: TokenRateLimitOptions,
): TokenRateLimitResult {
  try {
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
  } catch {
    // Fail closed: a broken limiter must never become an open gate.
    return { allowed: false, retryAfterMs: options.windowMs };
  }
}

/**
 * Build a namespaced rate-limit key for a PAT or user id, so `/api/mobile/*`
 * and `/api/mcp` (or distinct sub-routes) don't share buckets by accident.
 * Ex: `rateLimitKey("mobile", patId)`, `rateLimitKey("mcp", userId)`.
 */
export function rateLimitKey(namespace: string, tokenOrUserId: string): string {
  return `${namespace}:${tokenOrUserId}`;
}

/**
 * Convenience wrapper for the common case: rate-limit a request by the
 * authenticated PAT/user id under a route namespace, using the default
 * ceiling unless overridden.
 */
export function checkApiTokenRateLimit(
  namespace: string,
  tokenOrUserId: string,
  overrides: Partial<TokenRateLimitOptions> = {},
): TokenRateLimitResult {
  return checkTokenRateLimit(rateLimitKey(namespace, tokenOrUserId), {
    ...DEFAULT_TOKEN_RATE_LIMIT,
    ...overrides,
  });
}
