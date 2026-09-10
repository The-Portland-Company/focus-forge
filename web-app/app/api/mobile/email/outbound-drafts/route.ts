import { NextRequest, NextResponse } from "next/server";
import {
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import {
  createOutboundDraft,
  listOutboundDraftsForUser,
} from "@/lib/email-inbox/server";

// GET /api/mobile/email/outbound-drafts
// Mobile Bearer-token mirror of /api/email/outbound-drafts (GET).
// Lists the caller's compose drafts (new-message drafts, as opposed to
// reply drafts). Optional ?mailboxId=, ?projectId= filters.
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get("authorization"),
      ["read", "write", "admin"],
    );
    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }

    const sp = request.nextUrl.searchParams;
    const drafts = await listOutboundDraftsForUser(auth.user.id, {
      mailboxId: sp.get("mailboxId") || undefined,
      projectId: sp.get("projectId") || undefined,
    });

    return NextResponse.json(mobileSuccess(drafts, { count: drafts.length }), {
      status: 200,
    });
  } catch (error) {
    return NextResponse.json(
      mobileFailure("internal_error", "Failed to load outbound drafts", error),
      { status: 500 },
    );
  }
}

// POST /api/mobile/email/outbound-drafts
// Mobile Bearer-token mirror of /api/email/outbound-drafts (POST). Composes a
// brand-new outbound email draft (not a reply) from one of the caller's
// mailboxes. Body matches createOutboundDraft: mailboxId, to/cc/bcc (arrays of
// { email, name? }), subject, contentText/contentHtml, signatureText,
// attachments, projectId, status, scheduledFor. Sending is a separate step.
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get("authorization"),
      ["write", "admin"],
    );
    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }

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

    return NextResponse.json(mobileSuccess(draft), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      mobileFailure(
        "outbound_draft_failed",
        error instanceof Error ? error.message : "Failed to save outbound draft",
        error,
      ),
      { status: 400 },
    );
  }
}
