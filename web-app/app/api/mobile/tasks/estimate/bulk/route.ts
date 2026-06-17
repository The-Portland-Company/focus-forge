import { NextRequest, NextResponse } from "next/server";
import {
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import { getAdminClient } from "@/lib/supabase/admin";
import { estimateTaskMinutesWithModel } from "@/lib/ai-estimator/server";
import { fetchEstimatorModelChains } from "@/lib/ai-estimator/chains";

const MAX_BATCH = 25;
const CONCURRENCY = 5;

interface InlineTask {
  id?: string;
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
  const workers = new Array(Math.min(limit, items.length))
    .fill(0)
    .map(async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        results[i] = await worker(items[i], i);
      }
    });
  await Promise.all(workers);
  return results;
}

/**
 * POST /api/mobile/tasks/estimate/bulk
 *
 * Mobile-authed bulk estimator. Unlike the web bulk route (which hydrates tasks
 * from the DB by taskIds), the mobile variant takes inline task objects so the
 * iOS app can estimate unsaved/local tasks. Each task runs through the user's
 * configured estimator waterfall chain.
 *
 * Input: { tasks: [{ id?, name, description?, projectName?, tags?, priority?,
 *          dueInDays?, subtaskCount? }] }
 * Output: mobileSuccess({ results: [{ id?, minutes, confidence, rationale,
 *          model } | { id?, error }] })
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get("authorization"),
      ["read", "write", "admin"],
    );

    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        mobileFailure("validation_error", "Invalid JSON body"),
        { status: 400 },
      );
    }

    const rawTasks = Array.isArray(body?.tasks) ? body.tasks : [];
    const tasks: InlineTask[] = rawTasks
      .filter((t: any) => t && typeof t.name === "string" && t.name.trim())
      .slice(0, MAX_BATCH)
      .map((t: any) => ({
        id: typeof t.id === "string" ? t.id : undefined,
        name: t.name.trim(),
        description: typeof t.description === "string" ? t.description : null,
        projectName:
          typeof t.projectName === "string"
            ? t.projectName
            : typeof t.context === "string"
              ? t.context
              : null,
        tags: Array.isArray(t.tags)
          ? t.tags.filter((x: unknown): x is string => typeof x === "string")
          : undefined,
        priority: typeof t.priority === "number" ? t.priority : null,
        dueInDays: typeof t.dueInDays === "number" ? t.dueInDays : null,
        subtaskCount:
          typeof t.subtaskCount === "number" ? t.subtaskCount : null,
      }));

    if (tasks.length === 0) {
      return NextResponse.json(
        mobileFailure(
          "validation_error",
          "tasks (non-empty array with name) is required",
        ),
        { status: 400 },
      );
    }

    // Load the user's estimator chain once for the whole batch.
    const modelChains = await fetchEstimatorModelChains(
      getAdminClient(),
      auth.user.id,
    );

    const results = await runWithConcurrency(
      tasks,
      CONCURRENCY,
      async (task) => {
        try {
          const est = await estimateTaskMinutesWithModel({
            name: task.name,
            description: task.description,
            projectName: task.projectName,
            tags: task.tags,
            priority: task.priority,
            dueInDays: task.dueInDays,
            subtaskCount: task.subtaskCount,
            modelChains,
          });
          return {
            id: task.id,
            minutes: est.minutes,
            confidence: est.confidence,
            rationale: est.rationale ?? null,
            model: est.model,
          };
        } catch (err) {
          return {
            id: task.id,
            error: err instanceof Error ? err.message : "estimation_failed",
          };
        }
      },
    );

    return NextResponse.json(mobileSuccess({ results }), { status: 200 });
  } catch (error) {
    return NextResponse.json(
      mobileFailure("internal_error", "Failed to estimate tasks", error),
      { status: 500 },
    );
  }
}
