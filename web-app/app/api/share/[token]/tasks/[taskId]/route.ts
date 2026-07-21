import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { authorizeShareWrite } from "@/lib/share-write-guard";

export const dynamic = "force-dynamic";

// PATCH: toggle completion / rename a task from a read-write share link.
// Public — see share-write-guard.
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ token: string; taskId: string }> },
) {
  try {
    const { token, taskId } = await props.params;
    const grant = await authorizeShareWrite(token);
    if (!grant.ok) {
      return NextResponse.json({ error: grant.error }, { status: grant.status });
    }

    const body = await request.json().catch(() => ({}));
    const updates: Record<string, unknown> = {};

    if (typeof body?.completed === "boolean") {
      updates.completed = body.completed;
      updates.completed_at = body.completed ? new Date().toISOString() : null;
    }
    if (typeof body?.name === "string") {
      const name = body.name.trim();
      if (!name) {
        return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
      }
      if (name.length > 500) {
        return NextResponse.json({ error: "name is too long" }, { status: 400 });
      }
      updates.name = name;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid updates" }, { status: 400 });
    }
    updates.updated_at = new Date().toISOString();

    // The project_id filter is what confines this link to its own project: a
    // task id from any other project simply matches no row.
    const admin = getAdminClient();
    const { data, error } = await admin
      .from("tasks")
      .update(updates)
      .eq("id", taskId)
      .eq("project_id", grant.projectId)
      .is("deleted_at", null)
      .select("id,name,completed,section_id")
      .maybeSingle();

    if (error) {
      console.error("Share task update failed:", error);
      return NextResponse.json(
        { error: "Failed to update task" },
        { status: 500 },
      );
    }
    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ task: data });
  } catch (error) {
    console.error("Share task update threw:", error);
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 },
    );
  }
}
