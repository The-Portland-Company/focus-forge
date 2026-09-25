// Focus Forge stores no session of its own. The TPC access token (short-
// lived, ~15 min) and rotating refresh token live in httpOnly cookies; org +
// role come from the access token's `orgs` claim, resolved through
// `authenticate()` per request. Mirrors Ads Control's src/lib/auth.ts cookie
// scheme, ported to Next.js cookies().
import { cookies } from "next/headers";
import { authenticate } from "@/src/vendor/tpc-auth/authenticate";
import { refresh as refreshTokens } from "@/src/vendor/tpc-auth/oidc";
import { TPC_CLIENT_ID, TPC_RESOURCE } from "@/src/vendor/tpc-auth/config";
import type { AuthContext } from "@/src/vendor/tpc-auth/types";

export const ACCESS_COOKIE = "ff_at";
export const REFRESH_COOKIE = "ff_rt";
const REFRESH_TTL_S = 30 * 86400;

export async function setSessionCookies(tokens: {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}) {
  const store = await cookies();
  store.set(ACCESS_COOKIE, tokens.access_token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(60, tokens.expires_in ?? 900),
  });
  if (tokens.refresh_token) {
    store.set(REFRESH_COOKIE, tokens.refresh_token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: REFRESH_TTL_S,
    });
  }
}

export async function clearSessionCookies() {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

export interface Viewer {
  sub: string;
  email?: string;
  orgs: AuthContext["orgs"];
}

/**
 * The app-wide replacement for `supabase.auth.getUser()`/`getSession()`.
 * Returns `{ sub, email, orgs }` from the caller's TPC session (cookies) —
 * every route that used to read the Supabase session should call this
 * instead. Returns null when there is no valid session.
 */
export async function getViewer(): Promise<Viewer | null> {
  const ctx = await getTpcSession();
  if (!ctx) return null;
  return { sub: ctx.sub, email: ctx.email, orgs: ctx.orgs };
}

/**
 * Resolve the current request's TPC session, transparently refreshing an
 * expired access token from the refresh cookie. Returns null when there is
 * no valid session (caller should redirect to /auth/login).
 */
export async function getTpcSession(): Promise<AuthContext | null> {
  const store = await cookies();
  const accessToken = store.get(ACCESS_COOKIE)?.value;
  if (accessToken) {
    const req = new Request(TPC_RESOURCE, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const ctx = await authenticate(req, { resource: TPC_RESOURCE });
    if (ctx) return ctx;
  }

  const refreshToken = store.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) return null;

  try {
    const tokens = await refreshTokens({
      clientId: TPC_CLIENT_ID,
      refreshToken,
      resource: TPC_RESOURCE,
    });
    await setSessionCookies(tokens);
    const req = new Request(TPC_RESOURCE, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    return authenticate(req, { resource: TPC_RESOURCE });
  } catch {
    await clearSessionCookies();
    return null;
  }
}
