import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseAdapter } from "@/lib/db/supabase-adapter";
import { sendTaskLifecycleNotifications } from "@/lib/task-notifications";
import { normalizeRichText } from "@/lib/rich-text-sanitize";
import { normalizeTaskContentFields } from "@/lib/devnotes-meta";
import { getAdminClient } from "@/lib/supabase/admin";
import { maybeCreateAIMemoryFromEvent } from "@/lib/ai-memory/write";
import type { EventType } from "@/lib/ai-memory/types";

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
    const { data: existingTask } = (await (supabase as any)
      .from("tasks")
      .select(
        "id,name,description,assigned_to,project_id,priority,time_estimate,due_date,section_id",
      )
      .eq("id", params.id)
      .maybeSingle()) as { data: any };
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

      // AI-memory write hooks: learn from user corrections (best-effort).
      // Skip when the update originates from Todoist sync.
      const isTodoistSync =
        updates?.todoistId !== undefined ||
        updates?.todoist_id !== undefined ||
        updates?.lastTodoistSync !== undefined ||
        updates?.last_todoist_sync !== undefined ||
        updates?.todoistSyncToken !== undefined ||
        updates?.__source === "todoist" ||
        request.headers.get("x-todoist-sync") === "true";

      if (existingTask && !isTodoistSync) {
        void (async () => {
          try {
            const admin = getAdminClient();
            const taskText = [updatedTask.name, updatedTask.description]
              .filter(Boolean)
              .join("\n");

            const diffs: Array<{
              eventType: EventType;
              key: string;
              before: unknown;
              after: unknown;
            }> = [];

            const newProjectId = (updatedTask as any).projectId ?? null;
            if (
              newProjectId !== undefined &&
              newProjectId !== (existingTask as any).project_id
            ) {
              diffs.push({
                eventType: "user_moved_task_project",
                key: "project_id",
                before: (existingTask as any).project_id,
                after: newProjectId,
              });
            }

            const newPriority = (updatedTask as any).priority ?? null;
            if (
              newPriority !== undefined &&
              newPriority !== (existingTask as any).priority
            ) {
              diffs.push({
                eventType: "user_changed_priority",
                key: "priority",
                before: (existingTask as any).priority,
                after: newPriority,
              });
            }

            const newEstimate = (updatedTask as any).timeEstimate ?? null;
            if (
              newEstimate !== undefined &&
              newEstimate !== (existingTask as any).time_estimate
            ) {
              diffs.push({
                eventType: "user_changed_estimate",
                key: "time_estimate",
                before: (existingTask as any).time_estimate,
                after: newEstimate,
              });
            }

            const newDueDate = (updatedTask as any).dueDate ?? null;
            if (
              newDueDate !== undefined &&
              newDueDate !== (existingTask as any).due_date
            ) {
              diffs.push({
                eventType: "user_changed_due_date",
                key: "due_date",
                before: (existingTask as any).due_date,
                after: newDueDate,
              });
            }

            const newSectionId = (updatedTask as any).sectionId ?? null;
            if (
              newSectionId !== undefined &&
              newSectionId !== (existingTask as any).section_id
            ) {
              diffs.push({
                eventType: "user_changed_category",
                key: "section_id",
                before: (existingTask as any).section_id,
                after: newSectionId,
              });
            }

            for (const diff of diffs) {
              await maybeCreateAIMemoryFromEvent(admin, {
                user_id: user.id,
                source_type: "task",
                source_id: updatedTask.id,
                event_type: diff.eventType,
                before_json: { task: taskText, [diff.key]: diff.before },
                after_json: { task: taskText, [diff.key]: diff.after },
                reason: "user_corrected",
              });
            }
          } catch (e) {
            console.error("AI-memory task hook failed:", e);
          }
        })();
      }

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

    const { data: batchId, error } = await supabase.rpc("soft_delete_entity", {
      p_entity_type: "task",
      p_entity_id: params.id,
    });

    if (error) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, batchId });
  } catch (error) {
    console.error("DELETE /api/tasks/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete task" },
      { status: 500 },
    );
  }
}
