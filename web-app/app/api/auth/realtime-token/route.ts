import { NextResponse } from "next/server";
import { requireViewerOrUnauthorized } from "@/lib/auth/require-viewer";
import { mintScopedJwt, SCOPED_JWT_TTL_S } from "@/lib/auth/local-identity";

// GET /api/auth/realtime-token — hands the browser a short-lived (5-min) RLS
// JWT it can pass to `supabase.realtime.setAuth(token)` so a
// `postgres_changes` subscription is authorized as the caller. Supabase
// Realtime enforces RLS on the underlying table using the socket's JWT, same
// as PostgREST does for REST requests — without this, a subscription opened
// with only the anon key sees `auth.uid()` as null and RLS drops every
// change. See lib/auth/local-identity.ts#mintScopedJwt.
export async function GET() {
  const result = await requireViewerOrUnauthorized();
  if (result instanceof NextResponse) return result;

  const token = mintScopedJwt(result.user.id);
  return NextResponse.json({ token, expiresIn: SCOPED_JWT_TTL_S });
}
