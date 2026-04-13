import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { sendReplyDraftNow, updateReplyDraft } from "@/lib/email-inbox/server";

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const body = await request.json().catch(() => ({}));
    const params = await props.params;

    if (body.subject || body.contentHtml || body.contentText || body.attachments) {
      await updateReplyDraft({
        userId: auth.user.id,
        draftId: params.id,
        subject: typeof body.subject === "string" ? body.subject : undefined,
        contentText:
          typeof body.contentText === "string" ? body.contentText : undefined,
        contentHtml:
          typeof body.contentHtml === "string" ? body.contentHtml : undefined,
        signatureText:
          typeof body.signatureText === "string"
            ? body.signatureText
            : undefined,
        attachments: Array.isArray(body.attachments) ? body.attachments : undefined,
        to: Array.isArray(body.to) ? body.to : undefined,
        cc: Array.isArray(body.cc) ? body.cc : undefined,
      });
    }

    const draft = await sendReplyDraftNow({
      userId: auth.user.id,
      draftId: params.id,
    });

    return NextResponse.json(draft);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to send reply draft",
      },
      { status: 400 },
    );
  }
}
