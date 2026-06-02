import { NextRequest, NextResponse } from "next/server";
import {
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import { createSpamExceptionRuleForThread } from "@/lib/email-inbox/server";

// POST /api/mobile/email/spam-exceptions
// Mobile Bearer-token mirror of /api/email/spam-exceptions (POST). Creates a
// "never spam" exception rule for the sender of a thread and un-spams it — backs
// the "Allow future mail" toggle in the iOS spam review screen.
// Body: { threadId: string }
// → EmailSpamExceptionResult { threadId, rule, rationale }
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get("authorization"),
      ["write", "admin"],
    );
    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }

    const body = await request.json().catch(() => ({}));
    const threadId = String(body.threadId || "");
    if (!threadId) {
      return NextResponse.json(
        mobileFailure("validation_error", "threadId is required"),
        { status: 400 },
      );
    }

    const result = await createSpamExceptionRuleForThread(auth.user.id, threadId);
    return NextResponse.json(mobileSuccess(result), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      mobileFailure("action_failed", "Failed to create spam exception", error),
      { status: 400 },
    );
  }
}
