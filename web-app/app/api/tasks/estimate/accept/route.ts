import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";

interface Acceptance {
  taskId: string;
  minutes: number;
  aiSuggestedMinutes?: number | null;
  aiConfidence?: "low" | "med" | "high" | null;
}

function normalizeAcceptance(input: any): Acceptance | null {
  if (!input || typeof input !== "object") return null;
  if (typeof input.taskId !== "string" || !input.taskId) return null;
  const minutes = Number(input.minutes);
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 480) return null;
  return {
    taskId: input.taskId,
    minutes: Math.round(minutes),
    aiSuggestedMinutes:
      typeof input.aiSuggestedMinutes === "number"
        ? Math.round(input.aiSuggestedMinutes)
        : null,
    aiConfidence:
      input.aiConfidence === "low" ||
      input.aiConfidence === "med" ||
      input.aiConfidence === "high"
        ? input.aiConfidence
        : null,
  };
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

  const items: Acceptance[] = Array.isArray(body?.acceptances)
    ? body.acceptances.map(normalizeAcceptance).filter((a: any): a is Acceptance => !!a)
    : [normalizeAcceptance(body)].filter((a): a is Acceptance => !!a);

  if (items.length === 0) {
    return NextResponse.json(
      { error: "taskId + minutes (1..480) required" },
      { status: 400 },
    );
  }

  // Load task context for the example rows (snapshot at accept time so calibration survives task edits).
  const taskIds = items.map((i) => i.taskId);
  const { data: rows } = await supabase
    .from("tasks")
    .select(
      `id, name, description, priority,
       projects:project_id ( name ),
       task_tags ( tag:tag_id ( name ) )`,
    )
    .in("id", taskIds);

  const ctx = new Map<string, any>();
  for (const t of rows ?? []) ctx.set((t as any).id, t);

  // Update tasks. Supabase doesn't expose multi-row UPDATE with different values cheaply;
  // run sequentially — N is small (<=25).
  const updateResults: { taskId: string; ok: boolean; error?: string }[] = [];
  for (const item of items) {
    const { error } = await (supabase as any)
      .from("tasks")
      .update({ time_estimate: item.minutes })
      .eq("id", item.taskId);
    updateResults.push({ taskId: item.taskId, ok: !error, error: error?.message });
  }

  // Persist calibration examples for the successful updates.
  const exampleRows = items
    .filter((it) => updateResults.find((r) => r.taskId === it.taskId)?.ok)
    .map((it) => {
      const t = ctx.get(it.taskId);
      return {
        user_id: user.id,
        task_id: it.taskId,
        task_name: t?.name ?? "",
        task_description: t?.description ?? null,
        project_name: t?.projects?.name ?? null,
        tags: (t?.task_tags ?? [])
          .map((tt: any) => tt?.tag?.name)
          .filter((n: any): n is string => typeof n === "string"),
        priority: t?.priority ?? null,
        ai_suggested_minutes: it.aiSuggestedMinutes,
        ai_confidence: it.aiConfidence,
        accepted_minutes: it.minutes,
      };
    });

  if (exampleRows.length > 0) {
    // Non-fatal if it fails; the user-visible save still succeeded.
    await (supabase as any).from("task_estimate_examples").insert(exampleRows);
  }

  return NextResponse.json({ results: updateResults });
}
