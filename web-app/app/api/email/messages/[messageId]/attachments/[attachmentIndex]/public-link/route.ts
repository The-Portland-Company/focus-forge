import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { createOrGetAttachmentPublicLink } from "@/lib/email-inbox/attachment-public-links";

// POST /api/email/messages/{messageId}/attachments/{attachmentIndex}/public-link
//
// Mint (or reuse) a public share link for one attachment. Auth-gated: only a
// user who can access the thread may create a link. Returns an absolute URL to
// /api/public/attachments/{token} that anyone can open with no session.
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ messageId: string; attachmentIndex: string }> },
) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const params = await props.params;
    const attachmentIndex = Number(params.attachmentIndex);
    if (!Number.isInteger(attachmentIndex) || attachmentIndex < 0) {
      return NextResponse.json(
        { error: "Invalid attachment index" },
        { status: 400 },
      );
    }

    const link = await createOrGetAttachmentPublicLink(
      auth.user.id,
      params.messageId,
      attachmentIndex,
    );

    // Build the absolute URL from public host headers — request.url is often
    // http://0.0.0.0:8080 behind Railway (same reason the share routes do this).
    const host =
      request.headers.get("x-forwarded-host") ||
      request.headers.get("host") ||
      "focusforge.theportlandcompany.com";
    const proto = request.headers.get("x-forwarded-proto") || "https";
    const url = new URL(
      `/api/public/attachments/${link.token}`,
      `${proto}://${host}`,
    ).toString();

    return NextResponse.json({
      url,
      token: link.token,
      filename: link.filename,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create public link",
      },
      { status: 404 },
    );
  }
}
