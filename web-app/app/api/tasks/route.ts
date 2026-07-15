import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseAdapter } from "@/lib/db/supabase-adapter";
import {
  sendTaskLifecycleNotifications,
  sendTaskCreatedNotification,
} from "@/lib/task-notifications";
import { normalizeRichText } from "@/lib/rich-text-sanitize";
import { normalizeTaskContentFields } from "@/lib/devnotes-meta";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adapter = new SupabaseAdapter(supabase, session.user.id);
    const tasks = await adapter.getTasks();
    return NextResponse.json(tasks);
  } catch (error) {
    console.error("Failed to get tasks:", error);
    return NextResponse.json({ error: "Failed to get tasks" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const taskData = await request.json();

    // Get the Supabase client and authenticated user
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Initialize the Supabase adapter
    const adapter = new SupabaseAdapter(supabase, session.user.id);

    // Get the database user profile
    const dbUser = await adapter.getUser(session.user.id);

    if (!dbUser) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 },
      );
    }

    const normalizedTaskContent =
      taskData?.description !== undefined ||
      taskData?.devnotesMeta !== undefined ||
      taskData?.devnotes_meta !== undefined
        ? normalizeTaskContentFields({
            description:
              taskData?.description !== undefined
                ? normalizeRichText(taskData.description)
                : undefined,
            devnotesMeta: taskData?.devnotesMeta,
            devnotes_meta: taskData?.devnotes_meta,
          })
        : null;

    // If a goal is assigned, it must be a live goal in the same project.
    const goalId =
      taskData?.goalId ?? taskData?.goal_id ?? undefined;
    if (typeof goalId === "string" && goalId) {
      const { data: goal } = await supabase
        .from("goals")
        .select("id,project_id")
        .eq("id", goalId)
        .is("deleted_at", null)
        .maybeSingle();

      if (!goal) {
        return NextResponse.json(
          { error: "goalId must reference a live goal" },
          { status: 400 },
        );
      }
      if (
        taskData?.projectId &&
        (goal as any).project_id !== taskData.projectId
      ) {
        return NextResponse.json(
          { error: "goalId must reference a goal in the same project" },
          { status: 400 },
        );
      }
    }

    // Add the creator ID to the task data
    const taskDataWithCreator = {
      ...taskData,
      description: normalizedTaskContent
        ? normalizedTaskContent.description
        : taskData.description,
      devnotes_meta: normalizedTaskContent
        ? normalizedTaskContent.devnotesMeta
        : taskData.devnotes_meta,
      createdBy: dbUser.id,
    };

    const newTask = await adapter.createTask(taskDataWithCreator);

    void sendTaskLifecycleNotifications({
      taskId: newTask.id,
      actorUserId: session.user.id,
      previousAssignedTo: null,
      previousText: "",
    });

    void sendTaskCreatedNotification({
      taskId: newTask.id,
      actorUserId: session.user.id,
    });

    return NextResponse.json(newTask);
  } catch (error) {
    console.error("Failed to create task:", error);
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 },
    );
  }
}
