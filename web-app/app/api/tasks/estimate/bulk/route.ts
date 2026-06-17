import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { estimateTaskMinutes } from "@/lib/ai-estimator/server";
import { fetchRecentExamples } from "@/lib/ai-estimator/examples";
import { fetchEstimatorModelChains } from "@/lib/ai-estimator/chains";

const MAX_BATCH = 25;
const CONCURRENCY = 5;

interface HydratedTask {
  id: string;
  name: string;
  description?: string | null;
  projectName?: string | null;
  tags?: string[];
  priority?: number | null;
  dueInDays?: number | null;
  subtaskCount?: number | null;
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

function daysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const due = new Date(dateStr);
  if (Number.isNaN(due.getTime())) return null;
  const ms = due.setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  return Math.round(ms / 86_400_000);
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;
  const { supabase, user } = auth;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const taskIds = Array.isArray(body?.taskIds)
    ? body.taskIds.filter((id: any) => typeof id === "string").slice(0, MAX_BATCH)
    : [];
  if (taskIds.length === 0) {
    return NextResponse.json({ error: "taskIds is required" }, { status: 400 });
  }

  // Hydrate tasks with the context the estimator wants.
  const { data: rows, error } = await supabase
    .from("tasks")
    .select(
      `id, name, description, priority, due_date,
       projects:project_id ( name ),
       task_tags ( tag:tag_id ( name ) )`,
    )
    .in("id", taskIds);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Subtask counts in a single follow-up query.
  const subtaskCounts: Record<string, number> = {};
  const { data: subs } = await supabase
    .from("tasks")
    .select("parent_id, time_estimate")
    .in("parent_id", taskIds);
  // For "sum subtasks" we also track totals when all subtask estimates are known.
  const subtaskSums: Record<string, { total: number; missing: number }> = {};
  for (const row of subs ?? []) {
    const pid = (row as any).parent_id as string;
    subtaskCounts[pid] = (subtaskCounts[pid] || 0) + 1;
    const te = (row as any).time_estimate as number | null;
    if (!subtaskSums[pid]) subtaskSums[pid] = { total: 0, missing: 0 };
    if (typeof te === "number") subtaskSums[pid].total += te;
    else subtaskSums[pid].missing += 1;
  }

  const hydrated: HydratedTask[] = (rows ?? []).map((t: any) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    projectName: t.projects?.name ?? null,
    tags: (t.task_tags ?? [])
      .map((tt: any) => tt?.tag?.name)
      .filter((n: any): n is string => typeof n === "string"),
    priority: t.priority ?? null,
    dueInDays: daysUntil(t.due_date),
    subtaskCount: subtaskCounts[t.id] ?? 0,
  }));

  // Recent calibrations are shared across the batch (project-aware in the per-task call).
  const examplesByProject = new Map<string, Awaited<ReturnType<typeof fetchRecentExamples>>>();
  const globalExamples = await fetchRecentExamples(user.id, { limit: 12 });

  // Load the user's estimator chain once for the whole batch.
  const modelChains = await fetchEstimatorModelChains(supabase, user.id);

  const results = await runWithConcurrency(hydrated, CONCURRENCY, async (task) => {
    try {
      // Subtask short-circuit: if the parent has subtasks and they're all estimated, sum them.
      const sums = subtaskSums[task.id];
      if (sums && sums.missing === 0 && sums.total > 0) {
        return {
          taskId: task.id,
          minutes: Math.min(480, Math.max(1, sums.total)),
          confidence: "high" as const,
          rationale: "Sum of subtask estimates.",
        };
      }

      let examples = globalExamples;
      if (task.projectName) {
        if (!examplesByProject.has(task.projectName)) {
          examplesByProject.set(
            task.projectName,
            await fetchRecentExamples(user.id, {
              projectName: task.projectName,
              limit: 12,
            }),
          );
        }
        examples = examplesByProject.get(task.projectName)!;
      }

      const est = await estimateTaskMinutes({
        name: task.name,
        description: task.description,
        projectName: task.projectName,
        tags: task.tags,
        priority: task.priority,
        dueInDays: task.dueInDays,
        subtaskCount: task.subtaskCount,
        examples,
        modelChains,
      });

      return {
        taskId: task.id,
        minutes: est.minutes,
        confidence: est.confidence,
        rationale: est.rationale,
      };
    } catch (err) {
      return {
        taskId: task.id,
        error: err instanceof Error ? err.message : "estimation_failed",
      };
    }
  });

  return NextResponse.json({ results });
}
