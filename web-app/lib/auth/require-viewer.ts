// The mechanical replacement for every route's old:
//
//   const supabase = await createClient();
//   const { data: { user } } = await supabase.auth.getUser();
//   if (!user) return 401;
//
// (or the `getSession()` / `session.user` variant). Call `requireViewer()`
// instead: it authenticates against TPC, resolves the caller's local
// `profiles` row (see lib/auth/local-identity.ts), and returns an RLS-scoped
// `supabase` client plus a `user: { id, email }` shaped exactly like the old
// `supabase.auth.getUser()` result, so the rest of each route file needed no
// further change.
import { NextResponse } from "next/server";
import { getViewer } from "./tpc-session";
import { resolveLocalUser } from "./local-identity";
import { scopedSupabaseClient } from "./local-identity";

export interface RequireViewerResult {
  user: { id: string; email: string };
  viewer: NonNullable<Awaited<ReturnType<typeof getViewer>>>;
  supabase: ReturnType<typeof scopedSupabaseClient>;
}

/**
 * Returns the authenticated caller, or `null` when there is no valid TPC
 * session, or no matching local `profiles` row yet (pre-backfill: a person
 * who has only ever signed into TPC Auth and never had a local Focus Forge
 * account has no `profiles` row to scope RLS to — this is a real gap the
 * identity-link backfill closes; see the final report).
 */
export async function requireViewer(): Promise<RequireViewerResult | null> {
  const viewer = await getViewer();
  if (!viewer) return null;

  const localUser = await resolveLocalUser(viewer);
  if (!localUser) return null;

  return {
    user: { id: localUser.id, email: localUser.email },
    viewer,
    supabase: scopedSupabaseClient(localUser.id),
  };
}

/** `requireViewer()` plus the standard 401 JSON response for route handlers. */
export async function requireViewerOrUnauthorized(): Promise<
  RequireViewerResult | NextResponse
> {
  const result = await requireViewer();
  if (!result) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return result;
}
