import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import {
  logEmailAction,
  type EmailActionLogPhase,
} from "@/lib/email-inbox/action-log";

const ALLOWED_PHASES: EmailActionLogPhase[] = [
  "optimistic",
  "realtime_event",
];

/**
 * Minimal, authenticated sink for CLIENT-side email action lifecycle events
 * (optimistic mutations + realtime re-add observations). Combined with the
 * server-side phases written by applyThreadAction, this gives a full timeline
 * for debugging the "deleted email reappears" race. Best-effort — always 200s.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const body = await request.json().catch(() => ({}));
    const phase = body.phase as EmailActionLogPhase;
    if (!ALLOWED_PHASES.includes(phase)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    await logEmailAction({
      userId: auth.user.id,
      threadId: typeof body.threadId === "string" ? body.threadId : null,
      mailboxId: typeof body.mailboxId === "string" ? body.mailboxId : null,
      action: String(body.action ?? "unknown"),
      phase,
      detail:
        body.detail && typeof body.detail === "object" ? body.detail : null,
    });
  } catch {
    // Best-effort — never surface an error to the client hot path.
  }
  return NextResponse.json({ ok: true });
}
