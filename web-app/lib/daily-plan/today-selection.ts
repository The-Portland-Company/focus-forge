/**
 * today-selection.ts
 *
 * Shared logic for computing "what shows in the Today view" — extracted from
 * app/api/daily-plan/route.ts so the AI agent's list_today_view tool can
 * mirror the exact same task set the Today view renders, without divergence.
 *
 * The Today view shows incomplete tasks matching:
 *   isOverdue || isToday || isTomorrow || isRestOfWeek
 * plus daily_plan-pinned tasks and inbox items that pass shouldShowInboxItemInToday.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isOverdue, isToday, isTomorrow, isRestOfWeek } from "@/lib/date-utils";
import { richTextToPlainText } from "@/lib/rich-text";
import { listInboxItemsForUser } from "@/lib/email-inbox/server";
import { shouldShowInboxItemInToday } from "@/lib/email-inbox/shared";

export type TodayTask = {
  id: string;
  name: string;
  description: string | null;
  priority: number | null;
  dueDate: string | null;
  deadline: string | null;
  timeEstimateMinutes: number | null;
  projectId: string | null;
  projectName: string | null;
  isOverdue: boolean;
  isToday: boolean;
  isTomorrow: boolean;
  isRestOfWeek: boolean;
};

export type TodayInboxItem = {
  id: string;
  actionTitle: string;
  subject: string;
  classification: string | null;
  summary: string | null;
};

export type TodaySelection = {
  tasks: TodayTask[];
  inboxItems: TodayInboxItem[];
};

/**
 * Compute the Today view task set for a user.
 *
 * Reproduces the EXACT filter applied in app/api/daily-plan/route.ts:
 *   - incomplete tasks where isOverdue || isToday || isTomorrow || isRestOfWeek
 *   - respects snoozed_until (snoozed tasks are excluded)
 *   - inbox items that pass shouldShowInboxItemInToday
 *
 * @param supabase   An authenticated (or admin) Supabase client already scoped
 *                   to the acting user via RLS or an explicit user_id filter.
 *                   The daily-plan route uses `auth.supabase` (user-scoped RLS);
 *                   the agent uses `ctx.admin` filtered by accessible project ids.
 * @param userId     The acting user's id — used to fetch inbox items.
 * @param accessibleProjectIds  When provided, tasks are filtered to these project
 *                   ids (agent path). When null/undefined the query relies on RLS
 *                   (daily-plan route path).
 */
export async function selectTodayTasks(
  supabase: SupabaseClient,
  userId: string,
  accessibleProjectIds?: Set<string> | null,
): Promise<TodaySelection> {
  const nowMs = Date.now();

  // ── Fetch raw tasks ──────────────────────────────────────────────────────
  let taskQuery = supabase
    .from("tasks")
    .select(
      "id, name, description, priority, due_date, deadline, time_estimate, snoozed_until, completed, project_id",
    )
    .eq("completed", false)
    .order("due_date", { ascending: true })
    .limit(200);

  if (accessibleProjectIds && accessibleProjectIds.size > 0) {
    taskQuery = taskQuery.in("project_id", Array.from(accessibleProjectIds));
  } else if (accessibleProjectIds && accessibleProjectIds.size === 0) {
    // No accessible projects — short-circuit.
    return { tasks: [], inboxItems: [] };
  }

  const { data: tasksRows, error: tasksError } = await taskQuery;
  if (tasksError) {
    throw new Error(tasksError.message || "Failed to load tasks");
  }

  const allTasks = (tasksRows || []) as any[];

  // ── Apply Today-view filter (mirrors route.ts exactly) ───────────────────
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
    .slice(0, 60); // Hard cap matches the daily-plan route

  // ── Resolve project names ────────────────────────────────────────────────
  const projectIds = Array.from(
    new Set(
      eligibleTasks
        .map((t: any) => t.project_id)
        .filter((id: any) => typeof id === "string" && id),
    ),
  );

  const projectsById = new Map<string, any>();
  if (projectIds.length > 0) {
    const { data: projectRows } = await supabase
      .from("projects")
      .select("id, name")
      .in("id", projectIds);
    for (const project of projectRows || []) {
      projectsById.set(project.id, project);
    }
  }

  // ── Shape tasks ──────────────────────────────────────────────────────────
  const tasks: TodayTask[] = eligibleTasks.map((task: any) => {
    const dueDate = task.due_date ?? null;
    const project = task.project_id ? projectsById.get(task.project_id) : null;
    return {
      id: String(task.id),
      name: String(task.name || "Untitled"),
      description: task.description
        ? richTextToPlainText(task.description).slice(0, 400)
        : null,
      priority: typeof task.priority === "number" ? task.priority : null,
      dueDate,
      deadline: task.deadline ?? null,
      timeEstimateMinutes:
        typeof task.time_estimate === "number" ? task.time_estimate : null,
      projectId: task.project_id ?? null,
      projectName: project?.name ?? null,
      isOverdue: dueDate ? isOverdue(dueDate) : false,
      isToday: dueDate ? isToday(dueDate) : false,
      isTomorrow: dueDate ? isTomorrow(dueDate) : false,
      isRestOfWeek: dueDate ? isRestOfWeek(dueDate) : false,
    };
  });

  // ── Inbox items ──────────────────────────────────────────────────────────
  let rawInboxItems: any[] = [];
  try {
    rawInboxItems = await listInboxItemsForUser(userId);
  } catch {
    rawInboxItems = [];
  }

  const inboxItems: TodayInboxItem[] = rawInboxItems
    .filter((item) => shouldShowInboxItemInToday(item))
    .slice(0, 30)
    .map((item) => ({
      id: String(item.id),
      actionTitle: String(item.actionTitle || item.subject || "Triage email"),
      subject: String(item.subject || ""),
      classification: item.classification ?? null,
      summary: item.summaryText || item.previewText || null,
    }));

  return { tasks, inboxItems };
}
