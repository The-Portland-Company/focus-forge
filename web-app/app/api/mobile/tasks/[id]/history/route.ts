import { NextRequest, NextResponse } from "next/server";
import {
  getMobileAdapterForUser,
  getVisibleMobileUserIds,
  mobileFailure,
  mobileSuccess,
  resolveUserNames,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get("authorization"),
    );

    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }

    const params = await props.params;
    const taskId = params.id;
    const adapter = await getMobileAdapterForUser(auth.user.id);

    // Ownership check: the task must be visible to the current user — either it
    // lives in one of their projects, or it is assigned to a visible user id.
    let task: any = null;
    try {
      task = await adapter.getTask(taskId);
    } catch {
      task = null;
    }

    if (!task) {
      return NextResponse.json(
        mobileFailure("task_not_found", "Task not found for current user"),
        { status: 404 },
      );
    }

    const [projects, visibleUserIds] = await Promise.all([
      adapter.getProjects(),
      getVisibleMobileUserIds(auth.user.id),
    ]);
    const projectIds = new Set(projects.map((p: { id: string }) => p.id));
    const assignedTo = task.assigned_to ?? task.assignedTo ?? null;
    const hasAccess =
      (task.project_id && projectIds.has(task.project_id)) ||
      (assignedTo && visibleUserIds.includes(assignedTo));

    if (!hasAccess) {
      return NextResponse.json(
        mobileFailure("task_not_found", "Task not found for current user"),
        { status: 404 },
      );
    }

    const events = await adapter.getEntityHistory("task", taskId);

    // Resolve all actor names (plus the creator) in a single batch query.
    const actorIds = events.map((event: any) => event.actor_id);
    const earliestCreate = events.find(
      (event: any) => event.operation === "create",
    );
    const createdBy = earliestCreate?.actor_id ?? null;
    const nameMap = await resolveUserNames([...actorIds, createdBy]);

    const serializedEvents = events.map((event: any) => ({
      id: String(event.id),
      operation: event.operation,
      actor_id: event.actor_id ?? null,
      actor_name: event.actor_id
        ? nameMap.get(String(event.actor_id)) ?? null
        : null,
      occurred_at: event.occurred_at,
      snapshot: event.snapshot ?? null,
    }));

    return NextResponse.json(
      mobileSuccess({
        events: serializedEvents,
        created_by: createdBy,
        created_by_name: createdBy
          ? nameMap.get(String(createdBy)) ?? null
          : null,
      }),
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      mobileFailure("internal_error", "Failed to fetch task history", error),
      { status: 500 },
    );
  }
}
