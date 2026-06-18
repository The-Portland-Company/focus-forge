import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import {
  clampMinutes,
  normalizeTags,
  normalizeOptionalText,
  normalizePriority,
  validateExamplePayload,
} from "@/lib/ai-estimator/example-payload";

/**
 * AI calibration examples ("AI rules") recorded each time the user approves
 * an estimate. These rows are replayed as few-shot examples to the estimator
 * so it learns the user's pace, and they are the training set for any future
 * fine-tune. There is no separate deterministic rules engine for estimates —
 * these examples ARE the training signal.
 *
 * Fully user-curatable (HITL): GET list, POST add a manual example, PATCH edit,
 * DELETE remove. Every handler is double-guarded — RLS (`auth.uid() = user_id`)
 * plus an explicit `.eq("user_id", user.id)` filter.
 */

const SELECT_COLS =
  "id, task_id, task_name, task_description, project_name, tags, priority, ai_suggested_minutes, ai_confidence, accepted_minutes, source, created_at, updated_at";

function serialize(row: any) {
  return {
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
    source: row.source ?? "accepted",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

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
    .select(SELECT_COLS)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ examples: (data ?? []).map(serialize) });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;
  const { supabase, user } = auth;

  const body = await request.json().catch(() => null);
  const parsed = validateExamplePayload(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const v = parsed.value;

  const insertRow = {
    user_id: user.id,
    task_id: null,
    task_name: v.taskName,
    task_description: v.taskDescription,
    project_name: v.projectName,
    tags: v.tags,
    priority: v.priority,
    ai_suggested_minutes: null,
    ai_confidence: null,
    accepted_minutes: v.acceptedMinutes,
    source: "manual",
  };

  const { data, error } = await (supabase as any)
    .from("task_estimate_examples")
    .insert(insertRow)
    .select(SELECT_COLS)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ example: serialize(data) });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;
  const { supabase, user } = auth;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { source: "edited", updated_at: new Date().toISOString() };
  if (typeof body.taskName === "string") {
    const v = body.taskName.trim();
    if (!v) {
      return NextResponse.json({ error: "taskName cannot be empty" }, { status: 400 });
    }
    patch.task_name = v;
  }
  if ("taskDescription" in body) {
    patch.task_description = normalizeOptionalText(body.taskDescription);
  }
  if ("projectName" in body) {
    patch.project_name = normalizeOptionalText(body.projectName);
  }
  if ("tags" in body) patch.tags = normalizeTags(body.tags);
  if ("priority" in body) {
    patch.priority = normalizePriority(body.priority);
  }
  if ("acceptedMinutes" in body) {
    const m = clampMinutes(body.acceptedMinutes);
    if (m == null) {
      return NextResponse.json(
        { error: "acceptedMinutes must be a number 1–480" },
        { status: 400 },
      );
    }
    patch.accepted_minutes = m;
  }

  const { data, error } = await (supabase as any)
    .from("task_estimate_examples")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select(SELECT_COLS)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ example: serialize(data) });
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
