import { NextRequest, NextResponse } from "next/server";
import {
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import { revertSpamExceptionRule } from "@/lib/email-inbox/server";

// POST /api/mobile/email/spam-exceptions/[ruleId]/revert
// Mobile Bearer-token mirror of /api/email/spam-exceptions/[ruleId]/revert (POST).
// Deactivates a previously-created spam exception rule and re-enables spam
// detection for the thread — backs the "Keep as spam" undo in the iOS spam
// review screen.
// Body: { threadId: string }
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ ruleId: string }> },
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
    const result = await revertSpamExceptionRule({
      userId: auth.user.id,
      ruleId: params.ruleId,
      threadId: String(body.threadId || ""),
    });
    return NextResponse.json(mobileSuccess(result), { status: 200 });
  } catch (error) {
    return NextResponse.json(
      mobileFailure("action_failed", "Failed to revert spam exception", error),
      { status: 400 },
    );
  }
}
