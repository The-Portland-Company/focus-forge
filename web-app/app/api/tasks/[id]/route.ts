import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseAdapter } from "@/lib/db/supabase-adapter";
import { sendTaskLifecycleNotifications } from "@/lib/task-notifications";
import { normalizeRichText } from "@/lib/rich-text-sanitize";
import { normalizeTaskContentFields } from "@/lib/devnotes-meta";

export async function GET(
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

    const adapter = new SupabaseAdapter(supabase, session.user.id);
    const task = await adapter.getTask(params.id).catch(() => null);

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json(task);
  } catch (error) {
    console.error("GET /api/tasks/[id] error:", error);
    return NextResponse.json({ error: "Failed to get task" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const params = await props.params;
    const updates = await request.json();
    const supabase = await createClient();

    // Check authentication
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();
    if (authError || !session?.user) {
      console.error("PUT /api/tasks/[id] auth error:", authError);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = session.user;
    const { data: existingTask } = await supabase
      .from("tasks")
      .select("id,name,description,assigned_to")
      .eq("id", params.id)
      .maybeSingle();
    const adapter = new SupabaseAdapter(supabase, session.user.id);
    const normalizedTaskContent =
      updates?.description !== undefined ||
      updates?.devnotesMeta !== undefined ||
      updates?.devnotes_meta !== undefined
        ? normalizeTaskContentFields({
            description:
              updates?.description !== undefined
                ? normalizeRichText(updates.description)
                : undefined,
            devnotesMeta: updates?.devnotesMeta,
            devnotes_meta: updates?.devnotes_meta,
          })
        : null;
    const payload = {
      ...updates,
      ...(normalizedTaskContent
        ? {
            description: normalizedTaskContent.description,
            devnotes_meta: normalizedTaskContent.devnotesMeta,
          }
        : {}),
      updated_at: new Date().toISOString(),
    };

    try {
      const updatedTask = await adapter.updateTask(params.id, payload);
      if (!updatedTask) {
        return NextResponse.json({ error: "Task not found" }, { status: 404 });
      }

      void sendTaskLifecycleNotifications({
        taskId: updatedTask.id,
        actorUserId: user.id,
        previousAssignedTo: existingTask?.assigned_to || null,
        previousText: [
          existingTask?.name || "",
          existingTask?.description || "",
        ]
          .filter(Boolean)
          .join("\n"),
      });

      return NextResponse.json(updatedTask);
    } catch (error) {
      console.error("PUT /api/tasks/[id] caught error:", error);
      return NextResponse.json(
        { error: "Failed to update task" },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error("PUT /api/tasks/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update task" },
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

    const { error } = await supabase.from("tasks").delete().eq("id", params.id);

    if (error) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/tasks/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete task" },
      { status: 500 },
    );
  }
}
