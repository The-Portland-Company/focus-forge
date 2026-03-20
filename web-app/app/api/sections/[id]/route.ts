import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function toSectionResponse(row: any) {
  return {
    id: row.id,
    name: row.name,
    projectId: row.project_id,
    parentId: row.parent_id,
    color: row.color,
    description: row.description,
    icon: row.icon,
    order: row.order_index ?? row.todoist_order ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    todoistId: row.todoist_id,
    todoistOrder: row.todoist_order,
    todoistCollapsed: row.todoist_collapsed,
  };
}

export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const params = await props.params;
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (typeof body?.name === "string") updates.name = body.name.trim();
    if (body?.order !== undefined && Number.isFinite(Number(body.order))) {
      updates.todoist_order = Number(body.order);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid updates provided" }, { status: 400 });
    }

    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("sections")
      .update(updates)
      .eq("id", params.id)
      .select("*")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Section not found" },
        { status: error?.code === "PGRST116" ? 404 : 500 },
      );
    }

    return NextResponse.json(toSectionResponse(data));
  } catch (error) {
    console.error("Failed to update section:", error);
    return NextResponse.json({ error: "Failed to update section" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const params = await props.params;
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error } = await supabase.from("sections").delete().eq("id", params.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete section:", error);
    return NextResponse.json({ error: "Failed to delete section" }, { status: 500 });
  }
}
