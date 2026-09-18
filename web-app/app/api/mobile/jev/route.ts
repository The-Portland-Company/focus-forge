import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  getMobileAdapterForUser,
  getVisibleMobileUserIds,
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import { normalizeRichText } from "@/lib/rich-text-sanitize";

// Server-side Jev (TypeSafe) task triage.
//
// Mirrors the local `forge-jev-triage.mjs` scorer, but calls TypeSafe's
// systemOne API directly from the server so triage can run on a schedule
// (Railway cron / pg_cron) independent of any one machine.
//
// Guardrail: only non-sensitive task metadata (title, description, dates, tags,
// current priority, status) is sent to TypeSafe. No IDs, secrets, user data, or
// customer data ever leave the server to Jev. Only tasks Jev is confident about
// (act band) with a changed priority are written back; confirm/escalate bands
// are returned for human review and never auto-applied.

const TYPESAFE_BASE_URL =
  process.env.TYPESAFE_BASE_URL || "https://api.typesafe.ai";
const TYPESAFE_MODEL = process.env.TYPESAFE_DEFAULT_MODEL || "jev-latest";
const DEFAULT_ACT_THRESHOLD = 0.75;

// The five `forge-triage` recipe questions, embedded so the server needs no
// local jev-axi install or recipe file.
const QUESTIONS = {
  urgency: {
    type: "score",
    instructions:
      "How time-sensitive is this task, given any due date and its wording?",
    criteria: [
      "No deadline; can wait indefinitely",
      "Should happen soon but no hard date",
      "Due shortly or overdue; needs attention now",
    ],
  },
  blocker: {
    type: "noul",
    instructions:
      "Is this task blocking other work, a release, or another person from progressing?",
  },
  impact: {
    type: "score",
    instructions:
      "How large is the user- or business-facing impact if this task is done well?",
    criteria: [
      "Minor polish or nice-to-have",
      "Meaningful improvement to a real workflow",
      "Critical to core functionality, revenue, or trust",
    ],
  },
  effort: {
    type: "score",
    instructions: "How much effort does this task appear to require?",
    criteria: [
      "Quick, under an hour",
      "Moderate, up to a day",
      "Large, multi-day or unclear scope",
    ],
  },
  stale: {
    type: "noul",
    instructions:
      "Has this task sat untouched long enough that it likely needs re-evaluation or a nudge?",
  },
} as const;

type SanitizedTask = {
  title: string;
  description: string;
  dueDate: string | null;
  createdAt: string | null;
  currentPriority: number | null;
  tags: unknown[];
  status: "completed" | "open";
};

// Only non-sensitive fields leave the server.
function sanitize(task: any): SanitizedTask {
  return {
    title: task?.name ?? task?.title ?? "",
    description: task?.description ?? "",
    dueDate: task?.due_date ?? task?.dueDate ?? null,
    createdAt: task?.created_at ?? task?.createdAt ?? null,
    currentPriority: task?.priority ?? null,
    tags: task?.tags ?? [],
    status: task?.completed ?? task?.is_completed ? "completed" : "open",
  };
}

// Distance from 0.5 rescaled to 0..1 — how a noul probability becomes a
// confidence (matches jev-axi's `noulConfidence`).
function noulConfidence(p: number): number {
  return Math.min(1, Math.abs(p - 0.5) * 2);
}

function band(conf: number, actThreshold: number): "act" | "confirm" | "escalate" {
  if (conf >= actThreshold) return "act";
  if (conf >= 0.45) return "confirm";
  return "escalate";
}

type Normalized = {
  answer: number; // score: 0..2 continuous · noul: 0..1
  confidence: number;
};

// Normalize a live systemOne answer to {answer, confidence} the way jev-axi does.
function normalizeAnswer(a: any): Normalized {
  if (!a) return { answer: 0, confidence: 0 };
  if (a.type === "noul") {
    const p = typeof a.noul === "number" ? a.noul : 0;
    return { answer: p, confidence: noulConfidence(p) };
  }
  // score
  const s = typeof a.score === "number" ? a.score : 0;
  const c = typeof a.confidence === "number" ? a.confidence : 0;
  return { answer: s, confidence: c };
}

// Map calibrated answers -> importance in [0,1] -> priority 1..4.
function toPriority(answers: Record<string, any>) {
  const by: Record<string, Normalized> = {};
  for (const [id, raw] of Object.entries(answers || {})) {
    by[id] = normalizeAnswer(raw);
  }
  const s = (id: string) => (by[id]?.answer ?? 0) / 2; // score questions are 0..2
  const n = (id: string) => by[id]?.answer ?? 0; // noul questions are 0..1

  const importance =
    0.35 * s("urgency") +
    0.3 * s("impact") +
    0.2 * n("blocker") +
    0.1 * (1 - s("effort")) +
    0.05 * n("stale");

  let priority: number;
  if (importance >= 0.72) priority = 1;
  else if (importance >= 0.52) priority = 2;
  else if (importance >= 0.32) priority = 3;
  else priority = 4;

  const drivers = ["urgency", "impact", "blocker"];
  const confidence =
    drivers.reduce((acc, id) => acc + (by[id]?.confidence ?? 0), 0) /
    drivers.length;

  return { importance, priority, confidence, by };
}

function rationale(
  res: ReturnType<typeof toPriority>,
  target: number,
  current: number | null,
) {
  const c = res.by;
  const pct = (x: number | undefined) => `${Math.round((x ?? 0) * 100)}%`;
  const lvl = (id: string) => (c[id]?.answer ?? 0).toFixed(2);
  return (
    `🤖 Jev triage → priority ${current ?? "—"} → **${target}** ` +
    `(importance ${res.importance.toFixed(2)}, confidence ${pct(res.confidence)})\n` +
    `urgency ${lvl("urgency")}/2 · impact ${lvl("impact")}/2 · ` +
    `blocker ${pct(c.blocker?.answer)} · effort ${lvl("effort")}/2 · ` +
    `stale ${pct(c.stale?.answer)}`
  );
}

async function scoreTask(state: SanitizedTask, apiKey: string) {
  const res = await fetch(`${TYPESAFE_BASE_URL}/v1/systemone`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ state, questions: QUESTIONS, model: TYPESAFE_MODEL }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`TypeSafe ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  return json?.answers ?? {};
}

export async function POST(request: NextRequest) {
  const auth = await verifyMobileAccessTokenOrPat(
    request.headers.get("authorization"),
    ["write", "admin"],
  );
  if (!auth.ok) {
    return NextResponse.json(auth.error, { status: auth.status });
  }

  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      mobileFailure("not_configured", "TYPESAFE_API_KEY is not set"),
      { status: 503 },
    );
  }

  const userId = auth.user.id;

  try {
    const body = await request.json().catch(() => ({}));
    const projectId = typeof body?.projectId === "string" ? body.projectId : null;
    if (!projectId) {
      return NextResponse.json(
        mobileFailure("invalid_request", "projectId is required"),
        { status: 400 },
      );
    }
    const dryRun = body?.dryRun === true;
    const limit =
      typeof body?.limit === "number" && body.limit > 0
        ? Math.floor(body.limit)
        : Infinity;
    const actThreshold =
      typeof body?.actThreshold === "number" &&
      body.actThreshold > 0 &&
      body.actThreshold <= 1
        ? body.actThreshold
        : DEFAULT_ACT_THRESHOLD;

    // Gather open tasks visible to this user for the project.
    const visibleUserIds = await getVisibleMobileUserIds(userId);
    const seen = new Set<string>();
    const open: any[] = [];
    for (const uid of visibleUserIds) {
      const adapter = await getMobileAdapterForUser(uid);
      const tasks = await adapter.getTasks(projectId);
      for (const t of tasks) {
        if (!t?.id || seen.has(t.id)) continue;
        if (t.completed ?? t.is_completed) continue;
        seen.add(t.id);
        open.push(t);
      }
    }
    open.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const scoped = Number.isFinite(limit) ? open.slice(0, limit) : open;

    const adapter = await getMobileAdapterForUser(userId);
    const admin = getAdminClient();

    const applied: any[] = [];
    const review: any[] = [];
    const unchanged: any[] = [];

    for (const task of scoped) {
      const answers = await scoreTask(sanitize(task), apiKey);
      const res = toPriority(answers);
      const b = band(res.confidence, actThreshold);
      const current: number | null = task.priority ?? null;
      const row = {
        id: task.id,
        name: task.name ?? task.title ?? "",
        current,
        target: res.priority,
        importance: Number(res.importance.toFixed(2)),
        confidence: Number(res.confidence.toFixed(2)),
        band: b,
      };

      if (res.priority === current) {
        unchanged.push(row);
        continue;
      }
      if (b !== "act") {
        review.push(row);
        continue;
      }
      if (!dryRun) {
        await adapter.updateTask(task.id, { priority: res.priority });
        const { error: commentError } = await admin.from("comments").insert({
          content: normalizeRichText(rationale(res, res.priority, current)),
          task_id: task.id,
          project_id: null,
          user_id: userId,
          is_deleted: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        if (commentError) {
          row.band = "act";
          review.push({ ...row, error: commentError.message });
          continue;
        }
      }
      applied.push({ ...row, written: !dryRun });
    }

    return NextResponse.json(
      mobileSuccess({
        projectId,
        dryRun,
        scored: scoped.length,
        applied,
        review,
        unchanged,
      }),
    );
  } catch (error: any) {
    return NextResponse.json(
      mobileFailure("action_failed", error?.message ?? "Triage failed", error),
      { status: 400 },
    );
  }
}
