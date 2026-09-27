import { NextResponse } from "next/server";
import { requireViewerOrUnauthorized } from "@/lib/auth/require-viewer";

// GET /api/auth/me — the browser-side replacement for
// `supabase.auth.getSession()` / `.getUser()`, which no longer exist here:
// the browser holds no Supabase session at all now (see
// lib/auth/tpc-session.ts). `useSupabaseUser()` (lib/supabase/hooks.ts) and
// its dependents (`useUserProfile`, `useUserPreferences`) call this instead
// to get the viewer's identity plus their `profiles` / `user_preferences`
// rows in one round trip, RLS-scoped via `requireViewer()`'s
// `scopedSupabaseClient`.
export async function GET() {
  const result = await requireViewerOrUnauthorized();
  if (result instanceof NextResponse) return result;

  const { user, supabase } = result;

  const [{ data: profile }, preferencesResult] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase.from("user_preferences").select("*").eq("user_id", user.id).single(),
  ]);

  let preferences = preferencesResult.data;
  if (!preferences && preferencesResult.error?.code === "PGRST116") {
    const { data: created } = await supabase
      .from("user_preferences")
      .insert({ user_id: user.id, expanded_organizations: [] })
      .select()
      .single();
    preferences = created ?? null;
  }

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    profile: profile ?? null,
    preferences: preferences ?? null,
  });
}

// PATCH /api/auth/me — update the viewer's `profiles` or `user_preferences`
// row. The browser can no longer write these tables directly (no client-side
// Supabase session for RLS to check `auth.uid()` against), so
// `useUserProfile().updateProfile` / `useUserPreferences().updatePreferences`
// (lib/supabase/hooks.ts) go through here instead, RLS-scoped server-side via
// `requireViewer()`.
export async function PATCH(request: Request) {
  const result = await requireViewerOrUnauthorized();
  if (result instanceof NextResponse) return result;

  const { user, supabase } = result;
  const body = await request.json().catch(() => null);
  const table = body?.table;
  const updates = body?.updates;

  if (
    (table !== "profile" && table !== "preferences") ||
    !updates ||
    typeof updates !== "object"
  ) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { error } =
    table === "profile"
      ? await supabase.from("profiles").update(updates).eq("id", user.id)
      : await supabase.from("user_preferences").update(updates).eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
