import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  buildTrainingJsonl,
  type TrainingExampleRow,
} from "@/lib/ai-estimator/training-export";

/**
 * Admin-only: export the pooled fine-tune dataset as chat-format JSONL from the
 * approved examples of users who OPTED IN (profiles.contributes_training_data).
 * Records a fine_tune_jobs row (status 'exporting' -> 'ready' with the row
 * count) for traceability. The operator feeds this JSONL to the LoRA training
 * step (see docs/estimator-finetune-runbook.md); training itself is offline.
 *
 * Per the plan, only opted-in users' rows enter the shared pool. The per-user
 * data stays private; this endpoint never returns rows for users who have not
 * consented.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;
  const { supabase, user } = auth;

  // Gate to admins. The caller's own role is read under RLS (their own row).
  const { data: me } = await (supabase as any)
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!me || (me.role !== "admin" && me.role !== "super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = getAdminClient();

  // Opted-in user ids.
  const { data: optedIn, error: optErr } = await (admin as any)
    .from("profiles")
    .select("id")
    .eq("contributes_training_data", true);
  if (optErr) {
    return NextResponse.json({ error: optErr.message }, { status: 500 });
  }
  const userIds = (optedIn ?? []).map((r: any) => r.id);
  if (userIds.length === 0) {
    return NextResponse.json(
      { error: "No users have opted in to training-data contribution." },
      { status: 422 },
    );
  }

  const { data: rows, error: rowErr } = await (admin as any)
    .from("task_estimate_examples")
    .select(
      "task_name, task_description, project_name, tags, priority, ai_confidence, accepted_minutes",
    )
    .in("user_id", userIds);
  if (rowErr) {
    return NextResponse.json({ error: rowErr.message }, { status: 500 });
  }

  const examples = (rows ?? []) as TrainingExampleRow[];
  const jsonl = buildTrainingJsonl(examples);

  // Record the export as a job row (best-effort; non-fatal).
  await (admin as any).from("fine_tune_jobs").insert({
    scope: "platform",
    created_by: user.id,
    status: "ready",
    example_count: examples.length,
    dataset_ref: "inline-download",
  });

  return new NextResponse(jsonl, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson",
      "Content-Disposition": `attachment; filename="estimator-finetune-${examples.length}.jsonl"`,
    },
  });
}
