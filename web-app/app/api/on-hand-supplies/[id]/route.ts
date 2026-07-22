import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  if (typeof body?.name === "string") updates.name = body.name.trim();
  if (Object.prototype.hasOwnProperty.call(body ?? {}, "quantity")) {
    const q = body.quantity;
    updates.quantity =
      q === null || q === undefined || q === "" ? null : Number(q);
    if (!Number.isFinite(updates.quantity as number)) updates.quantity = null;
  }
  if (Object.prototype.hasOwnProperty.call(body ?? {}, "unit")) {
    updates.unit =
      typeof body.unit === "string" && body.unit.trim() ? body.unit.trim() : null;
  }
  if (Object.prototype.hasOwnProperty.call(body ?? {}, "note")) {
    updates.note =
      typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
  }
  if (Object.prototype.hasOwnProperty.call(body ?? {}, "sectionId")) {
    updates.section_id =
      typeof body.sectionId === "string" && body.sectionId ? body.sectionId : null;
  }
  if (Object.prototype.hasOwnProperty.call(body ?? {}, "taskId")) {
    updates.task_id =
      typeof body.taskId === "string" && body.taskId ? body.taskId : null;
  }
  if (body?.orderIndex !== undefined && Number.isFinite(Number(body.orderIndex))) {
    updates.order_index = Number(body.orderIndex);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid updates" }, { status: 400 });
  }

  const { data, error } = await (supabase as any)
    .from("on_hand_supplies")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "Supply not found" },
      { status: error?.code === "PGRST116" ? 404 : 500 },
    );
  }
  return NextResponse.json(toResponse(data));
}

export async function DELETE(
  _request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await (supabase as any)
    .from("on_hand_supplies")
    .delete()
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
