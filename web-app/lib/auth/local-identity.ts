// Bridge between a TPC Auth viewer and this app's still-local `profiles`
// table, for the window between "web login moved to TPC" and "the identity
// backfill + tpc_sub read-path switch is done" (see
// supabase/migrations/20260924000000_tpc_auth_additive.sql /
// 20260924000001_tpc_auth_deferred_drop.sql).
//
// Three things happen here:
//
// 1. `resolveForgeProfile(ctx, accessToken?)` is the single identity-mapping
//    rule for the whole app: resolve by `profiles.tpc_sub` first (fast path),
//    then fall back to a case-insensitive match on a *verified* email
//    (from the token's `email` claim, or — when the caller passes an access
//    token — TPC Auth's userinfo endpoint), persisting the mapping on a hit.
//    An unverified/absent email never links an identity. This mirrors
//    lib/mobile/api.ts's `verifyMobileAccessTokenOrPat`, which is the other
//    caller of this function — previously the two had separately-maintained
//    copies of this logic; don't let a third one grow back.
//
// 2. `resolveLocalUser(viewer)` is the web-session wrapper around it, for
//    routes/pages using `getViewer()`.
//
// 3. `scopedSupabaseClient(localUserId)` mints a short-lived Supabase-
//    compatible JWT (HS256, signed with SUPABASE_JWT_SECRET, `sub =
//    localUserId`) and hands it to a plain supabase-js client via the
//    Authorization header. PostgREST reads `sub` out of that JWT into
//    `auth.uid()`, so existing Row Level Security policies (`user_id =
//    auth.uid()`, and organization policies that join through
//    `user_organizations`) keep enforcing exactly as they did when the
//    browser held a real Supabase session — without this app minting or
//    storing Supabase sessions any more. This is the piece that makes the
//    mechanical `getViewer()` swap in the API routes safe: routes keep using
//    the same RLS-scoped `supabase` client shape, just sourced from a TPC
//    viewer instead of a Supabase cookie session.
import jwt from "jsonwebtoken";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { resolveIssuer } from "@/src/vendor/tpc-auth/types";
import type { Viewer } from "./tpc-session";

export interface LocalUser {
  id: string;
  email: string;
}

export interface TpcIdentity {
  sub: string;
  email?: string;
  claims?: Record<string, unknown>;
}

const localUserCache = new Map<string, { expires: number; user: LocalUser | null }>();
const CACHE_TTL_MS = 30_000;

/**
 * Best-effort fetch of the caller's verified email from the TPC Auth
 * userinfo endpoint, for access tokens that don't carry an `email` claim.
 */
async function fetchTpcUserinfoEmail(accessToken: string): Promise<string | null> {
  try {
    const issuer = resolveIssuer();
    const res = await fetch(`${issuer}/oauth/userinfo`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { email?: unknown; email_verified?: unknown };
    if (body?.email_verified === false) return null;
    return typeof body?.email === "string" && body.email ? body.email : null;
  } catch {
    return null;
  }
}

/**
 * TPC subs are NOT Forge ids — a TPC access token authenticates a real
 * person or service, but Forge's `created_by`/`assigned_to`/`profiles.id`
 * etc. are the pre-existing local ids. Resolve the caller's Forge profile by
 * `tpc_sub` first (fast path, set once we've matched by email), falling back
 * to a case-insensitive email match, persisting the mapping on a hit.
 * Returns null when no Forge profile can be found — callers must not proceed
 * with an unmapped id. `accessToken`, when given, lets a token without an
 * `email` claim resolve its verified email via userinfo.
 */
export async function resolveForgeProfile(
  ctx: TpcIdentity,
  accessToken?: string,
): Promise<LocalUser | null> {
  const svc = getAdminClient();

  const { data: bySub } = await svc
    .from("profiles")
    .select("id, email")
    .eq("tpc_sub", ctx.sub)
    .maybeSingle();
  if (bySub?.id) return { id: String(bySub.id), email: bySub.email ?? "" };

  // Only a verified email may link a TPC identity to an existing profile.
  const tokenEmail = ctx.claims?.email_verified === false ? undefined : ctx.email;
  const email = tokenEmail || (accessToken ? await fetchTpcUserinfoEmail(accessToken) : null);
  if (!email) return null;

  const { data: byEmail } = await svc
    .from("profiles")
    .select("id, email")
    .ilike("email", email)
    .maybeSingle();
  if (!byEmail?.id) return null;

  // Persist the mapping so future calls hit the tpc_sub fast path. Awaited
  // (not fire-and-forget): supabase-js query builders are lazy thenables and
  // never issue the request unless awaited/`.then()`-ed.
  await svc.from("profiles").update({ tpc_sub: ctx.sub }).eq("id", byEmail.id);

  return { id: String(byEmail.id), email: byEmail.email ?? "" };
}

/** Look up the local `profiles` row for a TPC viewer. See `resolveForgeProfile`. */
export async function resolveLocalUser(viewer: Viewer): Promise<LocalUser | null> {
  const cacheKey = viewer.sub;
  const cached = localUserCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.user;

  const user = await resolveForgeProfile({ sub: viewer.sub, email: viewer.email });
  localUserCache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, user });
  return user;
}

/** Seconds a `mintScopedJwt` token stays valid for. Keep in sync with the sign call below. */
export const SCOPED_JWT_TTL_S = 5 * 60;

/**
 * Mints the same short-lived HS256 JWT `scopedSupabaseClient` hands to
 * server-side supabase-js clients, for a caller that needs the raw token —
 * currently `/api/auth/realtime-token`, which hands it to the browser so
 * `supabase.realtime.setAuth(token)` can authenticate a `postgres_changes`
 * subscription as this user (Realtime enforces RLS using the socket's JWT,
 * same as PostgREST does for REST requests).
 */
export function mintScopedJwt(localUserId: string): string {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new Error(
      "SUPABASE_JWT_SECRET is not set — required to bridge a TPC viewer onto Supabase RLS. " +
        "Same value as the project's JWT secret (Supabase dashboard > Settings > API).",
    );
  }
  return jwt.sign(
    { sub: localUserId, role: "authenticated", aud: "authenticated" },
    secret,
    { expiresIn: SCOPED_JWT_TTL_S },
  );
}

/**
 * A Supabase client whose requests carry a JWT asserting `auth.uid() =
 * localUserId`, so existing RLS policies apply exactly as they did under a
 * real Supabase session. NOT a substitute for `createServiceClient()` — this
 * client is still RLS-scoped, just to a caller-supplied id rather than a
 * cookie session.
 */
export function scopedSupabaseClient(localUserId: string) {
  const token = mintScopedJwt(localUserId);
  return createSupabaseJsClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
