import { NextRequest, NextResponse } from "next/server";
import {
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import { createOrGetAttachmentPublicLink } from "@/lib/email-inbox/attachment-public-links";

// POST /api/mobile/email/attachments/public-link
//
// Mobile/PAT-authed mirror of the web create-link route: mints (or reuses) a
// public share link for one attachment so the iOS app can offer "Copy Public
// URL". Body: { messageId, attachmentIndex }. Only a user who can access the
// thread may create a link; the returned absolute URL opens with no session.
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
    const messageId = String(body.messageId || "").trim();
    const attachmentIndex = Number(body.attachmentIndex);
    if (!messageId || !Number.isInteger(attachmentIndex) || attachmentIndex < 0) {
      return NextResponse.json(
        mobileFailure(
          "invalid_request",
          "messageId and a non-negative attachmentIndex are required",
        ),
        { status: 400 },
      );
    }

    const link = await createOrGetAttachmentPublicLink(
      auth.user.id,
      messageId,
      attachmentIndex,
    );

    // Build the absolute URL from public host headers (request.url is often
    // http://0.0.0.0:8080 behind Railway).
    const host =
      request.headers.get("x-forwarded-host") ||
      request.headers.get("host") ||
      "focusforge.theportlandcompany.com";
    const proto = request.headers.get("x-forwarded-proto") || "https";
    const url = new URL(
      `/api/public/attachments/${link.token}`,
      `${proto}://${host}`,
    ).toString();

    return NextResponse.json(
      mobileSuccess({ url, token: link.token, filename: link.filename }),
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      mobileFailure(
        "public_link_failed",
        error instanceof Error ? error.message : "Failed to create public link",
        error,
      ),
      { status: 400 },
    );
  }
}
