export function getAppBaseUrl(options?: {
  requestUrl?: string | null;
  // Only a couple keys are read; accept a partial env so callers/tests can
  // pass a minimal object without the full ProcessEnv (e.g. NODE_ENV).
  env?: Partial<NodeJS.ProcessEnv>;
}) {
  const env = options?.env ?? process.env;
  const configuredUrl =
    env.NEXT_PUBLIC_APP_URL?.trim() || env.NEXT_PUBLIC_SITE_URL?.trim();

  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, "");
  }

  if (options?.requestUrl) {
    try {
      return new URL(options.requestUrl).origin;
    } catch {
      // Ignore invalid request URLs and fall through to the local default.
    }
  }

  return "http://localhost:3244";
}

export function getResetPasswordUrl(options?: {
  requestUrl?: string | null;
  // Only a couple keys are read; accept a partial env so callers/tests can
  // pass a minimal object without the full ProcessEnv (e.g. NODE_ENV).
  env?: Partial<NodeJS.ProcessEnv>;
}) {
  return `${getAppBaseUrl(options)}/auth/reset-password`;
}

// Build the magic-link callback URL that Supabase redirects the email link
// back to. `next` is the in-app path to land on after the session is
// established (sanitized to a safe relative path so a crafted email cannot
// bounce the user to an external site).
export function getMagicLinkCallbackUrl(options?: {
  requestUrl?: string | null;
  env?: Partial<NodeJS.ProcessEnv>;
  next?: string | null;
}) {
  const base = `${getAppBaseUrl(options)}/auth/callback`;
  const next = sanitizeNextPath(options?.next);
  return next ? `${base}?next=${encodeURIComponent(next)}` : base;
}

// Only allow same-site absolute paths ("/today", "/projects/x"). Anything else
// — an absolute URL, a protocol-relative "//evil.com", a backslash trick, or a
// missing leading slash — falls back to null so callers use their default.
export function sanitizeNextPath(next?: string | null): string | null {
  if (!next) return null;
  if (!next.startsWith("/")) return null;
  // Reject protocol-relative ("//host") and backslash-escaped variants that
  // some browsers normalize to "//".
  if (next.startsWith("//") || next.startsWith("/\\") || next.startsWith("/%2F")) {
    return null;
  }
  return next;
}
