import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import {
  sendOutboundDraftNow,
  updateOutboundDraft,
} from "@/lib/email-inbox/server";

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const body = await request.json().catch(() => ({}));
    const params = await props.params;

    if (
      body.mailboxId ||
      body.projectId !== undefined ||
      body.subject ||
      body.contentHtml ||
      body.contentText ||
      body.attachments ||
      body.to ||
      body.cc ||
      body.bcc
    ) {
      await updateOutboundDraft({
        userId: auth.user.id,
        draftId: params.id,
        mailboxId: typeof body.mailboxId === "string" ? body.mailboxId : undefined,
        projectId:
          typeof body.projectId === "string" || body.projectId === null
            ? body.projectId
            : undefined,
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
        bcc: Array.isArray(body.bcc) ? body.bcc : undefined,
      });
    }

    const draft = await sendOutboundDraftNow({
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
            : "Failed to send outbound draft",
      },
      { status: 400 },
    );
  }
}
