import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import {
  createOutboundDraft,
  listOutboundDraftsForUser,
} from "@/lib/email-inbox/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const drafts = await listOutboundDraftsForUser(auth.user.id, {
      status: request.nextUrl.searchParams.get("status") || undefined,
      mailboxId: request.nextUrl.searchParams.get("mailboxId") || undefined,
      projectId: request.nextUrl.searchParams.get("projectId") || undefined,
    });

    return NextResponse.json(drafts);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load outbound drafts",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const body = await request.json();
    const draft = await createOutboundDraft({
      userId: auth.user.id,
      mailboxId: String(body.mailboxId || ""),
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
        typeof body.signatureText === "string" ? body.signatureText : undefined,
      attachments: Array.isArray(body.attachments) ? body.attachments : [],
      to: Array.isArray(body.to) ? body.to : undefined,
      cc: Array.isArray(body.cc) ? body.cc : undefined,
      bcc: Array.isArray(body.bcc) ? body.bcc : undefined,
      status: typeof body.status === "string" ? body.status : undefined,
      scheduledFor:
        typeof body.scheduledFor === "string" ? body.scheduledFor : undefined,
    });

    return NextResponse.json(draft, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save outbound draft",
      },
      { status: 400 },
    );
  }
}
