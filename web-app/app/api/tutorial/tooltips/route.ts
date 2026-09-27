import { NextResponse } from "next/server";
import { requireViewerOrUnauthorized } from "@/lib/auth/require-viewer";

// GET /api/tutorial/tooltips — server-side replacement for
// lib/tutorial/queries.ts#fetchTooltips; see app/api/tutorial/chapters/route.ts.
export async function GET() {
  const result = await requireViewerOrUnauthorized();
  if (result instanceof NextResponse) return result;
  const { supabase } = result;

  const { data, error } = await (supabase as any)
    .from("tutorial_tooltips")
    .select("*")
    .order("order_index", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ tooltips: data ?? [] });
}
