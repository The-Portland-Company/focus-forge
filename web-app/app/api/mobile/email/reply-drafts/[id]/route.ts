import { NextRequest, NextResponse } from "next/server";
import {
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import { updateReplyDraft } from "@/lib/email-inbox/server";

// PATCH /api/mobile/email/reply-drafts/[id]
// Mobile Bearer-token mirror of /api/email/reply-drafts/[id] (PATCH).
// Updates an existing reply draft (content, recipients, schedule, status).
export async function PATCH(
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
    const draft = await updateReplyDraft({
      userId: auth.user.id,
      draftId: params.id,
      subject: typeof body.subject === "string" ? body.subject : undefined,
      contentText:
        typeof body.contentText === "string" ? body.contentText : undefined,
      contentHtml:
        typeof body.contentHtml === "string" ? body.contentHtml : undefined,
      signatureText:
        typeof body.signatureText === "string" ? body.signatureText : undefined,
      attachments: Array.isArray(body.attachments)
        ? body.attachments
        : undefined,
      to: Array.isArray(body.to) ? body.to : undefined,
      cc: Array.isArray(body.cc) ? body.cc : undefined,
      scheduledFor:
        typeof body.scheduledFor === "string" || body.scheduledFor === null
          ? body.scheduledFor
          : undefined,
      status: typeof body.status === "string" ? body.status : undefined,
    });

    return NextResponse.json(mobileSuccess(draft), { status: 200 });
  } catch (error) {
    return NextResponse.json(
      mobileFailure("action_failed", "Failed to update reply draft", error),
      { status: 400 },
    );
  }
}
