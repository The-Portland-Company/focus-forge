import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { listInboxItemsForUser } from "@/lib/email-inbox/server";
import { shouldShowInboxItemInToday } from "@/lib/email-inbox/shared";
import { runDailyPlanner } from "@/lib/daily-plan/server";
import { isOverdue, isToday, isTomorrow, isRestOfWeek } from "@/lib/date-utils";
import { richTextToPlainText } from "@/lib/rich-text";

export const dynamic = "force-dynamic";

function clampCapacity(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 300;
  return Math.min(1440, Math.max(30, Math.round(num)));
}

function todayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const requestedDate =
    typeof body?.date === "string" && body.date.trim()
      ? body.date.trim()
      : todayDateString();

  // Fetch profile capacity
  const { data: profileRow } = await auth.supabase
    .from("profiles")
    .select("daily_capacity_minutes")
    .eq("id", auth.user.id)
    .maybeSingle();

  const capacityMinutes =
    body?.overrideCapacityMinutes !== undefined
      ? clampCapacity(body.overrideCapacityMinutes)
      : clampCapacity((profileRow as any)?.daily_capacity_minutes ?? 300);

  // Fetch tasks for this user.
  // RLS policies should filter to org-visible tasks; we additionally cap and
  // filter to today/overdue/this-week to keep the prompt small.
  const { data: tasksRows, error: tasksError } = await auth.supabase
    .from("tasks")
    .select(
      "id, name, description, priority, due_date, deadline, time_estimate, snoozed_until, completed, project_id",
    )
    .eq("completed", false)
    .order("due_date", { ascending: true })
    .limit(200);

  if (tasksError) {
    return NextResponse.json(
      { error: tasksError.message || "Failed to load tasks" },
      { status: 500 },
    );
  }

  const projectIds = Array.from(
    new Set(
      (tasksRows || [])
        .map((row: any) => row.project_id)
        .filter((id: any) => typeof id === "string" && id),
    ),
  );

  const projectsById = new Map<string, any>();
  if (projectIds.length > 0) {
    const { data: projectRows } = await auth.supabase
      .from("projects")
      .select("id, name")
      .in("id", projectIds);
    for (const project of projectRows || []) {
      projectsById.set(project.id, project);
    }
  }

  const allTasks = (tasksRows || []) as any[];

  const nowMs = Date.now();
  const eligibleTasks = allTasks
    .filter((task: any) => {
      if (task.completed) return false;
      const dueDate = task.due_date || task.dueDate;
      if (!dueDate) return false;
      const snoozedUntil = task.snoozed_until || task.snoozedUntil;
      if (snoozedUntil) {
        const snoozedMs = new Date(snoozedUntil).getTime();
        if (Number.isFinite(snoozedMs) && snoozedMs > nowMs) {
          return false;
        }
      }
      return (
        isOverdue(dueDate) ||
        isToday(dueDate) ||
        isTomorrow(dueDate) ||
        isRestOfWeek(dueDate)
      );
    })
    .slice(0, 60); // Hard cap to keep prompt size sane

  const planTasks = eligibleTasks.map((task: any) => {
    const dueDate = task.due_date;
    const project = task.project_id ? projectsById.get(task.project_id) : null;
    return {
      id: String(task.id),
      name: String(task.name || "Untitled"),
      description: task.description
        ? richTextToPlainText(task.description).slice(0, 400)
        : null,
      priority: typeof task.priority === "number" ? task.priority : null,
      dueDate: dueDate || null,
      deadline: task.deadline || null,
      timeEstimateMinutes:
        typeof task.time_estimate === "number" ? task.time_estimate : null,
      projectName: project?.name || null,
      isOverdue: dueDate ? isOverdue(dueDate) : false,
      blockedBy: [] as string[],
      blocking: [] as string[],
    };
  });

  // Inbox items for Today
  let inboxItems: any[] = [];
  try {
    inboxItems = await listInboxItemsForUser(auth.user.id);
  } catch {
    inboxItems = [];
  }
  const planInboxItems = inboxItems
    .filter((item) => shouldShowInboxItemInToday(item))
    .slice(0, 30)
    .map((item) => ({
      id: String(item.id),
      actionTitle: String(item.actionTitle || item.subject || "Triage email"),
      subject: String(item.subject || ""),
      classification: item.classification || null,
      summary: item.summaryText || item.previewText || null,
    }));

  // Time blocks for the date (filter by start_time within local-day window)
  const dayStart = new Date(`${requestedDate}T00:00:00`);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const { data: blockRows } = await auth.supabase
    .from("time_blocks")
    .select("id, start_time, end_time, title")
    .eq("user_id", auth.user.id)
    .gte("start_time", dayStart.toISOString())
    .lt("start_time", dayEnd.toISOString());

  const planBlocks = (blockRows || []).map((row: any) => ({
    id: String(row.id),
    startTime: row.start_time,
    endTime: row.end_time,
    title: row.title || null,
  }));

  const pinnedTaskIds = Array.isArray(body?.pinnedTaskIds)
    ? body.pinnedTaskIds.map((value: unknown) => String(value)).filter(Boolean)
    : [];
  const trimToCapacity = Boolean(body?.trimToCapacity);

  // Short-circuit if nothing to plan
  if (planTasks.length === 0 && planInboxItems.length === 0) {
    return NextResponse.json({
      date: requestedDate,
      capacityMinutes,
      plannedMinutes: 0,
      overflowMinutes: 0,
      orderedItems: [],
      deferred: [],
      estimatesProposed: [],
      generatedAt: new Date().toISOString(),
    });
  }

  try {
    const plan = await runDailyPlanner({
      request: body,
      resolvedDate: requestedDate,
      capacityMinutes,
      trimToCapacity,
      tasks: planTasks,
      inboxItems: planInboxItems,
      timeBlocks: planBlocks,
      pinnedTaskIds,
    });
    return NextResponse.json(plan);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Daily planner failed",
      },
      { status: 500 },
    );
  }
}
