import { NextRequest, NextResponse } from "next/server";
import {
  createServiceSupabase,
  fetchLiveGoal,
  filterTasksByView,
  getMobileAdapterForUser,
  getVisibleMobileUserIds,
  mobileFailure,
  mobileSuccess,
  normalizeTaskInput,
  serializeMobileTask,
  serializeMobileTasks,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import {
  sendTaskLifecycleNotifications,
  sendTaskCreatedNotification,
} from "@/lib/task-notifications";
import { normalizeTaskContentFields } from "@/lib/devnotes-meta";
import { normalizeRichText } from "@/lib/rich-text-sanitize";
import { BARTOK_USER_ID } from "@/lib/agents/bartok";

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get("authorization"),
      ["read", "write", "admin"],
    );

    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }

    const visibleUserIds = await getVisibleMobileUserIds(auth.user.id);
    const view = request.nextUrl.searchParams.get("view") || "all";
    const projectId =
      request.nextUrl.searchParams.get("projectId") || undefined;

    const taskGroups = await Promise.all(
      visibleUserIds.map(async (userId) => {
        const adapter = await getMobileAdapterForUser(userId);
        return adapter.getTasks(projectId);
      }),
    );
    const mergedById = new Map<string, any>();
    taskGroups.flat().forEach((task: any) => {
      mergedById.set(task.id, task);
    });
    const tasks = Array.from(mergedById.values());
    const filtered = filterTasksByView(tasks, view);

    return NextResponse.json(
      mobileSuccess(serializeMobileTasks(filtered), {
        view,
        project_id: projectId || null,
        count: filtered.length,
        source_user_count: visibleUserIds.length,
      }),
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      mobileFailure("internal_error", "Failed to fetch tasks", error),
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get("authorization"),
      ["write", "admin"],
    );

    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }

    const raw = await request.json();
    const payload = normalizeTaskInput(raw);
    const normalizedTaskContent =
      payload.description !== undefined ||
      payload.devnotes_meta !== undefined ||
      raw?.devnotesMeta !== undefined
        ? normalizeTaskContentFields({
            description:
              typeof payload.description === "string"
                ? normalizeRichText(payload.description)
                : undefined,
            devnotesMeta: raw?.devnotesMeta,
            devnotes_meta:
              typeof payload.devnotes_meta === "string"
                ? payload.devnotes_meta
                : undefined,
          })
        : null;

    if (!payload.name || typeof payload.name !== "string") {
      return NextResponse.json(
        mobileFailure("validation_error", "Task name is required"),
        { status: 400 },
      );
    }

    // Goal association: validate + inherit section/project from the goal.
    const serviceSupabase = createServiceSupabase();
    let goalId =
      typeof payload.goal_id === "string" ? payload.goal_id : undefined;
    const parentId =
      typeof payload.parent_id === "string" ? payload.parent_id : undefined;

    // A subtask with no explicit goal inherits its parent's goal_id.
    if (!goalId && parentId) {
      const { data: parent } = await serviceSupabase
        .from("tasks")
        .select("goal_id")
        .eq("id", parentId)
        .is("deleted_at", null)
        .maybeSingle();
      if (parent?.goal_id) {
        goalId = parent.goal_id as string;
        payload.goal_id = goalId;
      }
    }

    if (goalId) {
      const goal = await fetchLiveGoal(serviceSupabase, goalId);
      if (!goal) {
        return NextResponse.json(
          mobileFailure("validation_error", "goal_id must reference a live goal"),
          { status: 400 },
        );
      }

      let effectiveProject =
        typeof payload.project_id === "string" ? payload.project_id : undefined;
      if (!effectiveProject && typeof payload.section_id === "string") {
        const { data: section } = await serviceSupabase
          .from("sections")
          .select("project_id")
          .eq("id", payload.section_id)
          .is("deleted_at", null)
          .maybeSingle();
        effectiveProject = (section?.project_id as string) || undefined;
      }

      if (effectiveProject && effectiveProject !== goal.project_id) {
        return NextResponse.json(
          mobileFailure(
            "validation_error",
            "goal_id must belong to the same project as the task",
          ),
          { status: 400 },
        );
      }

      // Inherit project + section when the task named only a goal.
      if (payload.project_id === undefined) payload.project_id = goal.project_id;
      if (payload.section_id === undefined) payload.section_id = goal.section_id;
    }

    const adapter = await getMobileAdapterForUser(auth.user.id);
    const now = new Date().toISOString();

    const newTask = await adapter.createTask({
      ...payload,
      ...(normalizedTaskContent
        ? {
            description: normalizedTaskContent.description,
            devnotes_meta: normalizedTaskContent.devnotesMeta,
          }
        : {}),
      // Tasks created programmatically default to the Bartok agent user unless
      // the caller explicitly assigns them to someone else.
      assigned_to:
        payload.assigned_to !== undefined
          ? payload.assigned_to
          : BARTOK_USER_ID,
      created_at: payload.created_at || now,
      updated_at: now,
      completed: payload.completed ?? false,
      priority: payload.priority ?? 4,
    });

    void sendTaskLifecycleNotifications({
      taskId: newTask.id,
      actorUserId: auth.user.id,
      previousAssignedTo: null,
      previousText: "",
    });

    void sendTaskCreatedNotification({
      taskId: newTask.id,
      actorUserId: auth.user.id,
    });

    return NextResponse.json(mobileSuccess(serializeMobileTask(newTask)), {
      status: 201,
    });
  } catch (error) {
    return NextResponse.json(
      mobileFailure("internal_error", "Failed to create task", error),
      { status: 500 },
    );
  }
}
