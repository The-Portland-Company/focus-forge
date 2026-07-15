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

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const projectId =
      typeof body?.projectId === "string" ? body.projectId : "";

    if (!name || !projectId) {
      return NextResponse.json(
        { error: "name and projectId are required" },
        { status: 400 },
      );
    }

    const order =
      body?.order !== undefined && Number.isFinite(Number(body.order))
        ? Number(body.order)
        : 0;
    const sectionId =
      typeof body?.sectionId === "string" && body.sectionId.trim()
        ? body.sectionId.trim()
        : null;
    const description =
      typeof body?.description === "string" ? body.description : null;

    // If nested under a section, it must be a live section in the same project.
    if (sectionId) {
      const { data: section } = await supabase
        .from("sections")
        .select("id,project_id")
        .eq("id", sectionId)
        .is("deleted_at", null)
        .maybeSingle();

      if (!section || (section as any).project_id !== projectId) {
        return NextResponse.json(
          {
            error:
              "sectionId must reference a live section in the same project",
          },
          { status: 400 },
        );
      }
    }

    const insertPayload: any = {
      name,
      project_id: projectId,
      section_id: sectionId,
      description,
      order_index: order,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("goals")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Failed to create goal" },
        { status: 500 },
      );
    }

    return NextResponse.json(toGoalResponse(data), { status: 201 });
  } catch (error) {
    console.error("Failed to create goal:", error);
    return NextResponse.json(
      { error: "Failed to create goal" },
      { status: 500 },
    );
  }
}
