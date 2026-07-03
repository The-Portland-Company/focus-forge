import { NextRequest, NextResponse } from "next/server";
import {
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import { classifySpam, getSpamConfidenceThreshold } from "@/lib/spam/server";

// POST /api/mobile/spam/classify
// Bearer-token mirror of /api/spam/classify. Manual k-NN classify tester.
// Body: { text: string, mailboxId?, organizationId? }
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get("authorization"),
      ["read", "write", "admin"],
    );
    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }

    const body = await request.json().catch(() => ({}));
    const text = String(body.text || "").trim();
    if (!text) {
      return NextResponse.json(
        mobileFailure("validation_error", "text is required"),
        { status: 400 },
      );
    }

    const verdict = await classifySpam(text, {
      userId: auth.user.id,
      organizationId: body.organizationId ?? null,
      mailboxId: body.mailboxId ?? null,
    });
    const threshold = getSpamConfidenceThreshold();
    return NextResponse.json(
      mobileSuccess({
        ...verdict,
        threshold,
        confident: verdict.label !== null && verdict.confidence >= threshold,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      mobileFailure("action_failed", "Failed to classify text", error),
      { status: 400 },
    );
  }
}
