import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function toTaskSectionResponse(row: any) {
  return {
    id: row.id,
    taskId: row.task_id,
    sectionId: row.section_id,
    createdAt: row.created_at,
  };
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();
    const db = supabase as any;

    if (authError || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const taskId = request.nextUrl.searchParams.get("taskId");
    const sectionId = request.nextUrl.searchParams.get("sectionId");

    let query = db
      .from("task_sections")
      .select("*")
      .order("created_at", { ascending: true });

    if (taskId) query = query.eq("task_id", taskId);
    if (sectionId) query = query.eq("section_id", sectionId);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json((data || []).map(toTaskSectionResponse));
  } catch (error) {
    console.error("Failed to get task-sections:", error);
    return NextResponse.json(
      { error: "Failed to get task-section associations" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();
    const db = supabase as any;

    if (authError || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const taskId = typeof body?.taskId === "string" ? body.taskId : "";
    const sectionId = typeof body?.sectionId === "string" ? body.sectionId : "";

    if (!taskId || !sectionId) {
      return NextResponse.json(
        { error: "taskId and sectionId are required" },
        { status: 400 },
      );
    }

    const { data, error } = await db
      .from("task_sections")
      .upsert(
        {
          task_id: taskId,
          section_id: sectionId,
        },
        { onConflict: "task_id,section_id" },
      )
      .select("*")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Failed to create association" },
        { status: 500 },
      );
    }

    await db
      .from("tasks")
      .update({ section_id: sectionId, updated_at: new Date().toISOString() })
      .eq("id", taskId);

    return NextResponse.json(toTaskSectionResponse(data), { status: 201 });
  } catch (error) {
    console.error("Failed to create task-section association:", error);
    return NextResponse.json({ error: "Failed to create association" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();
    const db = supabase as any;

    if (authError || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const taskId = request.nextUrl.searchParams.get("taskId");
    const sectionId = request.nextUrl.searchParams.get("sectionId");

    if (!taskId || !sectionId) {
      return NextResponse.json(
        { error: "taskId and sectionId query params are required" },
        { status: 400 },
      );
    }

    const { error } = await db
      .from("task_sections")
      .delete()
      .eq("task_id", taskId)
      .eq("section_id", sectionId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete task-section association:", error);
    return NextResponse.json({ error: "Failed to delete association" }, { status: 500 });
  }
}
