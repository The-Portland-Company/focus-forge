import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function toGoalResponse(row: any) {
  return {
    id: row.id,
    sectionId: row.section_id || undefined,
    projectId: row.project_id,
    name: row.name,
    description: row.description || undefined,
    completed: row.completed ?? false,
    completedAt: row.completed_at || undefined,
    order: row.order_index ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

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

    // Load the live goal so we can validate section moves against its project.
    const { data: goal } = await supabase
      .from("goals")
      .select("id,section_id,project_id")
      .eq("id", params.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!goal) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    const update: Record<string, unknown> = {};

    if (typeof body?.name === "string") {
      const name = body.name.trim();
      if (!name) {
        return NextResponse.json(
          { error: "Goal name cannot be empty" },
          { status: 400 },
        );
      }
      update.name = name;
    }

    if (body?.description !== undefined) {
      update.description =
        typeof body.description === "string" ? body.description : null;
    }

    if (body?.order !== undefined && Number.isFinite(Number(body.order))) {
      update.order_index = Number(body.order);
    }

    if (typeof body?.completed === "boolean") {
      update.completed = body.completed;
      update.completed_at = body.completed ? new Date().toISOString() : null;
    }

    // Detect a section_id move (null clears it). Reassign live tasks to match.
    const hasSectionKey = Object.prototype.hasOwnProperty.call(
      body,
      "sectionId",
    );
    let sectionMove = false;
    let newSectionId: string | null = (goal as any).section_id ?? null;

    if (hasSectionKey) {
      newSectionId =
        typeof body.sectionId === "string" && body.sectionId
          ? body.sectionId
          : null;

      if (newSectionId !== ((goal as any).section_id ?? null)) {
        sectionMove = true;

        if (newSectionId) {
          const { data: section } = await supabase
            .from("sections")
            .select("id,project_id")
            .eq("id", newSectionId)
            .is("deleted_at", null)
            .maybeSingle();

          if (
            !section ||
            (section as any).project_id !== (goal as any).project_id
          ) {
            return NextResponse.json(
              {
                error:
                  "sectionId must reference a live section in the same project",
              },
              { status: 400 },
            );
          }
        }

        update.section_id = newSectionId;
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json(
        { error: "No valid updates provided" },
        { status: 400 },
      );
    }

    update.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("goals")
      .update(update)
      .eq("id", params.id)
      .select("*")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Goal not found" },
        { status: error?.code === "PGRST116" ? 404 : 500 },
      );
    }

    // Moving a goal reassigns its live tasks' section_id to match (or clears it).
    if (sectionMove) {
      const { error: taskMoveError } = await supabase
        .from("tasks")
        .update({
          section_id: newSectionId,
          updated_at: new Date().toISOString(),
        })
        .eq("goal_id", params.id)
        .is("deleted_at", null);

      if (taskMoveError) {
        console.error(
          "Failed to reassign tasks on goal section move:",
          taskMoveError,
        );
      }
    }

    return NextResponse.json(toGoalResponse(data));
  } catch (error) {
    console.error("Failed to update goal:", error);
    return NextResponse.json(
      { error: "Failed to update goal" },
      { status: 500 },
    );
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

    const { data: batchId, error } = await supabase.rpc("soft_delete_entity", {
      p_entity_type: "goal",
      p_entity_id: params.id,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, batchId });
  } catch (error) {
    console.error("Failed to delete goal:", error);
    return NextResponse.json(
      { error: "Failed to delete goal" },
      { status: 500 },
    );
  }
}
