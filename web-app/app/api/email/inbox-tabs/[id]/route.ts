import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";

// PUT: update a tab's name and/or rules.
export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;
  const { id } = await props.params;
  const db = auth.supabase as any;
  const body = await request.json().catch(() => ({}));

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body?.name === "string" && body.name.trim()) {
    update.name = body.name.trim();
  }
  if (body?.rules && Array.isArray(body.rules.conditions)) {
    update.rules_json = {
      matchMode: body.rules.matchMode === "all" ? "all" : "any",
      conditions: body.rules.conditions,
    };
  }
  if (typeof body?.orderIndex === "number") {
    update.order_index = body.orderIndex;
  }

  const { data, error } = await db
    .from("email_inbox_tabs")
    .update(update)
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
    tab: {
      id: data.id,
      name: data.name,
      orderIndex: data.order_index ?? 0,
      rules: data.rules_json ?? { matchMode: "any", conditions: [] },
      isDefault: Boolean(data.is_default),
    },
  });
}

// DELETE: remove a tab.
export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;
  const { id } = await props.params;
  const db = auth.supabase as any;
  const { error } = await db
    .from("email_inbox_tabs")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
