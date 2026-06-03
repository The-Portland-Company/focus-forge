import { NextRequest, NextResponse } from "next/server";
import {
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import {
  applyThreadAction,
  createSpamExceptionRuleForThread,
  getThreadDetailForUser,
} from "@/lib/email-inbox/server";

// Actions supported by applyThreadAction in the shared server lib.
const PASSTHROUGH_ACTIONS = new Set([
  "reprocess",
  "approve",
  "quarantine",
  "mark_read",
  "archive",
  "spam",
  "delete",
  "always_delete_sender",
  "snooze",
  "set_classification",
  "to_task",
]);

// POST /api/mobile/email/threads/[id]/actions
// Mobile Bearer-token mirror of /api/email/threads/[id]/actions (POST).
// Body: { action, snoozedUntil?, projectId? }
// Supported actions: approve, quarantine, archive, spam, not_spam, delete,
// mark_read, snooze, to_task (+ reprocess, always_delete_sender).
// "not_spam" maps to createSpamExceptionRuleForThread (rule generation), since
// the shared applyThreadAction does not handle un-spamming directly.
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get("authorization"),
      ["write", "admin"],
    );
    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }

    const body = await request.json().catch(() => ({}));
    const params = await props.params;
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "not_spam") {
      const result = await createSpamExceptionRuleForThread(
        auth.user.id,
        params.id,
      );
      return NextResponse.json(mobileSuccess(result), { status: 200 });
    }

    if (!PASSTHROUGH_ACTIONS.has(action)) {
      return NextResponse.json(
        mobileFailure("validation_error", `Unsupported action: ${action}`),
        { status: 400 },
      );
    }

    const result = await applyThreadAction({
      userId: auth.user.id,
      threadId: params.id,
      action: action as Parameters<typeof applyThreadAction>[0]["action"],
      snoozedUntil: body.snoozedUntil ?? null,
      projectId: body.projectId ?? null,
      classification: body.classification ?? null,
    });

    // Mirror web behavior: reprocess returns refreshed thread detail.
    if (action === "reprocess") {
      const detail = await getThreadDetailForUser(auth.user.id, params.id);
      return NextResponse.json(mobileSuccess(detail), { status: 200 });
    }

    return NextResponse.json(mobileSuccess(result), { status: 200 });
  } catch (error) {
    return NextResponse.json(
      mobileFailure("action_failed", "Failed to apply action", error),
      { status: 400 },
    );
  }
}
