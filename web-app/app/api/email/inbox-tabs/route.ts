import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { DEFAULT_INBOX_TABS } from "@/lib/email-inbox/inbox-tabs";

function toClient(row: any) {
  return {
    id: row.id,
    name: row.name,
    orderIndex: row.order_index ?? 0,
    rules: row.rules_json ?? { matchMode: "any", conditions: [] },
    isDefault: Boolean(row.is_default),
  };
}

// GET: list the user's inbox tabs, seeding the defaults on first use.
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;
  const db = auth.supabase as any;

  let { data } = await db
    .from("email_inbox_tabs")
    .select("*")
    .eq("user_id", auth.user.id)
    .order("order_index", { ascending: true });

  if (!data || data.length === 0) {
    const seed = DEFAULT_INBOX_TABS.map((t, i) => ({
      user_id: auth.user.id,
      name: t.name,
      order_index: i,
      rules_json: t.rules,
      is_default: true,
    }));
    const { data: seeded } = await db
      .from("email_inbox_tabs")
      .insert(seed)
      .select("*");
    data = seeded || [];
    data.sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));
  }

  return NextResponse.json({ tabs: (data || []).map(toClient) });
}

// POST: create a new tab.
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;
  const db = auth.supabase as any;
  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const rules =
    body?.rules && Array.isArray(body.rules.conditions)
      ? {
          matchMode: body.rules.matchMode === "all" ? "all" : "any",
          conditions: body.rules.conditions,
        }
      : { matchMode: "any", conditions: [] };

  // Append after existing tabs.
  const { count } = await db
    .from("email_inbox_tabs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", auth.user.id);

  const { data, error } = await db
    .from("email_inbox_tabs")
    .insert({
      user_id: auth.user.id,
      name,
      order_index: count ?? 0,
      rules_json: rules,
      is_default: false,
    })
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "Failed to create tab" },
      { status: 500 },
    );
  }
  return NextResponse.json({ tab: toClient(data) });
}
