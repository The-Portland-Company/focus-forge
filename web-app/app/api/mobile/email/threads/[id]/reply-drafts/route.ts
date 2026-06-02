import { NextRequest, NextResponse } from "next/server";
import {
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import { createReplyDraft } from "@/lib/email-inbox/server";

// POST /api/mobile/email/threads/[id]/reply-drafts
// Mobile Bearer-token mirror of /api/email/threads/[id]/reply-drafts (POST).
// Creates a reply draft (manual or AI-sourced) for the thread.
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
    const draft = await createReplyDraft({
      userId: auth.user.id,
      threadId: params.id,
      source: body.source === "ai" ? "ai" : "manual",
      replyMode:
        body.replyMode === "internal_note" ? "internal_note" : "reply_all",
      subject: typeof body.subject === "string" ? body.subject : undefined,
      contentText:
        typeof body.contentText === "string" ? body.contentText : undefined,
      contentHtml:
        typeof body.contentHtml === "string" ? body.contentHtml : undefined,
      signatureText:
        typeof body.signatureText === "string" ? body.signatureText : undefined,
      attachments: Array.isArray(body.attachments) ? body.attachments : [],
      to: Array.isArray(body.to) ? body.to : undefined,
      cc: Array.isArray(body.cc) ? body.cc : undefined,
      status: typeof body.status === "string" ? body.status : undefined,
      scheduledFor:
        typeof body.scheduledFor === "string" ? body.scheduledFor : undefined,
      contextSnapshot:
        body.contextSnapshot && typeof body.contextSnapshot === "object"
          ? body.contextSnapshot
          : undefined,
      aiMetadata:
        body.aiMetadata && typeof body.aiMetadata === "object"
          ? body.aiMetadata
          : undefined,
    });

    return NextResponse.json(mobileSuccess(draft), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      mobileFailure("action_failed", "Failed to save reply draft", error),
      { status: 400 },
    );
  }
}
