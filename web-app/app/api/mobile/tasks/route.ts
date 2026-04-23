import { NextRequest, NextResponse } from "next/server";
import {
  filterTasksByView,
  getMobileAdapterForUser,
  getVisibleMobileUserIds,
  mobileFailure,
  mobileSuccess,
  normalizeTaskInput,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import { sendTaskLifecycleNotifications } from "@/lib/task-notifications";
import { normalizeTaskContentFields } from "@/lib/devnotes-meta";
import { normalizeRichText } from "@/lib/rich-text-sanitize";

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
      mobileSuccess(filtered, {
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

    return NextResponse.json(mobileSuccess(newTask), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      mobileFailure("internal_error", "Failed to create task", error),
      { status: 500 },
    );
  }
}
