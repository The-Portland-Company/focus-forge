import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";

/**
 * AI calibration examples ("AI rules") recorded each time the user approves
 * an estimate. These rows are replayed as few-shot examples to the estimator
 * so it learns the user's pace. There is no separate deterministic rules
 * engine for estimates — these examples ARE the training signal.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;
  const { supabase, user } = auth;

  const limitParam = Number(request.nextUrl.searchParams.get("limit"));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(200, Math.round(limitParam))
      : 100;

  const { data, error } = await (supabase as any)
    .from("task_estimate_examples")
    .select(
      "id, task_id, task_name, task_description, project_name, tags, priority, ai_suggested_minutes, ai_confidence, accepted_minutes, created_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    examples: (data ?? []).map((row: any) => ({
      id: row.id,
      taskId: row.task_id,
      taskName: row.task_name,
      taskDescription: row.task_description,
      projectName: row.project_name,
      tags: row.tags ?? [],
      priority: row.priority,
      aiSuggestedMinutes: row.ai_suggested_minutes,
      aiConfidence: row.ai_confidence,
      acceptedMinutes: row.accepted_minutes,
      createdAt: row.created_at,
    })),
  });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;
  const { supabase, user } = auth;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const { error } = await (supabase as any)
    .from("task_estimate_examples")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
