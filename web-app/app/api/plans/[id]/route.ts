import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function toPlanResponse(row: any) {
  return {
    id: row.id,
    organizationId: row.organization_id || undefined,
    projectId: row.project_id || undefined,
    goalId: row.goal_id || undefined,
    sectionId: row.section_id || undefined,
    name: row.name,
    contentMarkdown: row.content_markdown ?? "",
    order: row.order_index ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// PATCH /api/plans/[id] — update name / content / order. Owner is immutable.
export async function PATCH(
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
    const update: Record<string, unknown> = {};

    if (typeof body?.name === "string") {
      const name = body.name.trim();
      if (!name) {
        return NextResponse.json(
          { error: "Plan name cannot be empty" },
          { status: 400 },
        );
      }
      update.name = name;
    }

    if (typeof body?.contentMarkdown === "string") {
      update.content_markdown = body.contentMarkdown;
    }

    if (body?.order !== undefined && Number.isFinite(Number(body.order))) {
      update.order_index = Number(body.order);
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: "No valid updates provided" },
        { status: 400 },
      );
    }

    update.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("plans")
      .update(update)
      .eq("id", params.id)
      .is("deleted_at", null)
      .select("*")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Plan not found" },
        { status: error?.code === "PGRST116" ? 404 : 500 },
      );
    }

    return NextResponse.json(toPlanResponse(data));
  } catch (error) {
    console.error("Failed to update plan:", error);
    return NextResponse.json({ error: "Failed to update plan" }, { status: 500 });
  }
}

// DELETE /api/plans/[id] — soft delete via the entity-versioning RPC.
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

    const { data: batchId, error } = await supabase.rpc("soft_delete_entity", {
      p_entity_type: "plan",
      p_entity_id: params.id,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, batchId });
  } catch (error) {
    console.error("Failed to delete plan:", error);
    return NextResponse.json({ error: "Failed to delete plan" }, { status: 500 });
  }
}
