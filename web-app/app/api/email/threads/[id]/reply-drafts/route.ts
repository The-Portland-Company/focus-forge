import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { createReplyDraft } from "@/lib/email-inbox/server";

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const body = await request.json();
    const params = await props.params;
    const draft = await createReplyDraft({
      userId: auth.user.id,
      threadId: params.id,
      source: body.source === "ai" ? "ai" : "manual",
      replyMode: body.replyMode === "internal_note" ? "internal_note" : "reply_all",
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

    return NextResponse.json(draft, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save reply draft",
      },
      { status: 400 },
    );
  }
}
