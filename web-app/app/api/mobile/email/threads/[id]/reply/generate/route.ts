import { NextRequest, NextResponse } from "next/server";
import {
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import { generateAiReplyForThread } from "@/lib/email-inbox/server";

// POST /api/mobile/email/threads/[id]/reply/generate
// Mobile Bearer-token mirror of /api/email/threads/[id]/reply/generate (POST).
// Generates an AI reply draft. Body: { override?: { conciseness, tone, personality, ... } }
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
    const draft = await generateAiReplyForThread({
      userId: auth.user.id,
      threadId: params.id,
      override:
        body.override && typeof body.override === "object"
          ? body.override
          : undefined,
    });

    return NextResponse.json(mobileSuccess(draft), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      mobileFailure("action_failed", "Failed to generate AI reply", error),
      { status: 400 },
    );
  }
}
