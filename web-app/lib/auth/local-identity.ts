// Bridge between a TPC Auth viewer and this app's still-local `profiles`
// table, for the window between "web login moved to TPC" and "the identity
// backfill + tpc_sub read-path switch is done" (see
// supabase/migrations/20260924000000_tpc_auth_additive.sql /
// 20260924000001_tpc_auth_deferred_drop.sql).
//
// Two things happen here:
//
// 1. `resolveLocalUser(viewer)` maps a TPC `sub`/`email` to the existing
//    local `profiles.id` (== the old `auth.users.id`) by email match. This
//    is a stand-in for the real identity-link table TPC Auth's own backfill
//    produces (`tpc_sub` column) — once that backfill has run, this should
//    look up `profiles.tpc_sub = viewer.sub` directly instead of by email,
//    and this file's email-matching path should be deleted.
//
// 2. `scopedSupabaseClient(localUserId)` mints a short-lived Supabase-
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
import { createServiceClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { Viewer } from "./tpc-session";

export interface LocalUser {
  id: string;
  email: string;
}

const localUserCache = new Map<string, { expires: number; user: LocalUser | null }>();
const CACHE_TTL_MS = 30_000;

/** Look up the local `profiles` row for a TPC viewer, by email. */
export async function resolveLocalUser(viewer: Viewer): Promise<LocalUser | null> {
  if (!viewer.email) return null;
  const cached = localUserCache.get(viewer.email);
  if (cached && cached.expires > Date.now()) return cached.user;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("profiles")
    .select("id, email")
    .eq("email", viewer.email)
    .maybeSingle();

  const user = !error && data ? { id: data.id, email: data.email } : null;
  localUserCache.set(viewer.email, { expires: Date.now() + CACHE_TTL_MS, user });
  return user;
}

/**
 * A Supabase client whose requests carry a JWT asserting `auth.uid() =
 * localUserId`, so existing RLS policies apply exactly as they did under a
 * real Supabase session. NOT a substitute for `createServiceClient()` — this
 * client is still RLS-scoped, just to a caller-supplied id rather than a
 * cookie session.
 */
export function scopedSupabaseClient(localUserId: string) {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new Error(
      "SUPABASE_JWT_SECRET is not set — required to bridge a TPC viewer onto Supabase RLS. " +
        "Same value as the project's JWT secret (Supabase dashboard > Settings > API).",
    );
  }
  const token = jwt.sign(
    { sub: localUserId, role: "authenticated", aud: "authenticated" },
    secret,
    { expiresIn: "5m" },
  );
  return createSupabaseJsClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
