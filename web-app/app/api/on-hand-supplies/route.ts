import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * On-hand supplies: an itemized list of general supplies already available,
 * scoped to a project and optionally a section (task list) or task. Distinct
 * from is_supply tasks (things still to acquire) — these are never completed.
 *
 * RLS scopes every row to the caller's project membership, so a plain cookie
 * client is sufficient and no row can leak across organizations.
 */

function toResponse(row: any) {
  return {
    id: row.id,
    projectId: row.project_id,
    sectionId: row.section_id,
    taskId: row.task_id,
    name: row.name,
    quantity: row.quantity,
    unit: row.unit,
    note: row.note,
    orderIndex: row.order_index ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The generated Supabase types don't include this table yet, so the typed
  // client infers `never`; cast to reach it until types are regenerated.
  const db = supabase as any;
  const projectId = request.nextUrl.searchParams.get("projectId");
  let query = db
    .from("on_hand_supplies")
    .select("*")
    .order("order_index", { ascending: true })
    .order("created_at", { ascending: true });
  if (projectId) query = query.eq("project_id", projectId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ supplies: (data || []).map(toResponse) });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const projectId =
    typeof body?.projectId === "string" ? body.projectId.trim() : "";
  if (!name || !projectId) {
    return NextResponse.json(
      { error: "name and projectId are required" },
      { status: 400 },
    );
  }

  const quantity =
    body?.quantity === null || body?.quantity === undefined || body.quantity === ""
      ? null
      : Number(body.quantity);
  const insert = {
    project_id: projectId,
    section_id:
      typeof body?.sectionId === "string" && body.sectionId ? body.sectionId : null,
    task_id: typeof body?.taskId === "string" && body.taskId ? body.taskId : null,
    name,
    quantity: Number.isFinite(quantity as number) ? quantity : null,
    unit: typeof body?.unit === "string" && body.unit.trim() ? body.unit.trim() : null,
    note: typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null,
    order_index: Number.isFinite(Number(body?.orderIndex))
      ? Number(body.orderIndex)
      : 0,
  };

  const { data, error } = await (supabase as any)
    .from("on_hand_supplies")
    .insert(insert)
    .select("*")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "Failed to create supply" },
      { status: 500 },
    );
  }
  return NextResponse.json(toResponse(data), { status: 201 });
}
