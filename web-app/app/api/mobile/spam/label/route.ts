import { NextRequest, NextResponse } from "next/server";
import {
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import { recordSpamLabel } from "@/lib/spam/server";

// POST /api/mobile/spam/label
// Bearer-token mirror of /api/spam/label. Records a training label for the
// private k-NN spam classifier.
// Body: { text, label: "spam" | "not_spam", threadId?, mailboxId?, organizationId?, note? }
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
    const text = String(body.text || "").trim();
    const label = body.label === "not_spam" ? "not_spam" : body.label === "spam" ? "spam" : null;
    if (!text || !label) {
      return NextResponse.json(
        mobileFailure("validation_error", "text and label ('spam' | 'not_spam') are required"),
        { status: 400 },
      );
    }

    const result = await recordSpamLabel({
      userId: auth.user.id,
      organizationId: body.organizationId ?? null,
      mailboxId: body.mailboxId ?? null,
      threadId: body.threadId ?? null,
      text,
      label,
      note: body.note ?? null,
    });
    return NextResponse.json(mobileSuccess(result), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      mobileFailure("action_failed", "Failed to record spam label", error),
      { status: 400 },
    );
  }
}
