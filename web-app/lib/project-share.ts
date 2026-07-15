import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHmac,
} from "crypto";

/**
 * Server-side helpers for public project share links.
 *
 * - Tokens are unguessable url-safe random strings.
 * - Passcodes are never stored in plaintext: we store `scrypt(salt, passcode)`
 *   as `salt:hash` (both hex).
 * - When a visitor clears the passcode gate we hand them a short signed cookie
 *   (HMAC of the share token) so subsequent loads render without re-prompting.
 *   The signing secret is the service-role key, which never reaches the client.
 */

/** Generate an unguessable url-safe share token (~43 chars from 32 bytes). */
export function generateShareToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Hash a passcode as `salt:derivedKey` (both hex). */
export function hashPasscode(passcode: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(passcode, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

/** Constant-time verify a passcode against a stored `salt:hash`. */
export function verifyPasscode(passcode: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = scryptSync(passcode, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

function shareSecret(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY not available");
  return key;
}

/** Signed cookie name for a given share token. */
export function shareCookieName(token: string): string {
  // Keep it short + token-scoped so unlocking one link doesn't unlock another.
  return `ffshare_${createHmac("sha256", shareSecret()).update(`name:${token}`).digest("hex").slice(0, 16)}`;
}

/** The signed value proving the passcode gate was cleared for this token. */
export function shareCookieValue(token: string): string {
  return createHmac("sha256", shareSecret()).update(`unlock:${token}`).digest("hex");
}

/** Validate a presented cookie value against the expected signature. */
export function isValidShareCookie(token: string, value: string | undefined): boolean {
  if (!value) return false;
  const expected = shareCookieValue(token);
  if (value.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}

/** True when a share row is currently usable (not revoked, not expired). */
export function isShareActive(share: {
  revoked_at: string | null;
  expires_at: string | null;
}): boolean {
  if (share.revoked_at) return false;
  if (share.expires_at && new Date(share.expires_at).getTime() <= Date.now()) {
    return false;
  }
  return true;
}
