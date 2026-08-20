import { NextRequest, NextResponse } from "next/server";
import { resolveActiveAttachmentPublicLink } from "@/lib/email-inbox/attachment-public-links";
import { getAttachmentByMessageForPublicLink } from "@/lib/email-inbox/server";

// GET /api/public/attachments/{token}
//
// PUBLIC — no session required. The unguessable token IS the authorization: it
// maps to exactly ONE (message, attachment index). We re-fetch that single file
// live from the mailbox owner's IMAP (attachments are never stored) and stream
// it. A revoked or expired token 404s. The token never exposes anything beyond
// its one attachment.
export async function GET(
  _request: NextRequest,
  props: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await props.params;
    const link = await resolveActiveAttachmentPublicLink(token);
    if (!link) {
      return NextResponse.json(
        { error: "This link is invalid, expired, or has been revoked." },
        { status: 404 },
      );
    }

    const attachment = await getAttachmentByMessageForPublicLink(
      link.messageId,
      link.attachmentIndex,
    );

    const filename = link.filename || attachment.filename || "attachment";
    const contentType =
      link.contentType || attachment.contentType || "application/octet-stream";

    return new NextResponse(attachment.content, {
      headers: {
        "Content-Type": contentType,
        // Inline so images/PDFs preview in the browser; the filename still
        // applies if the viewer saves it.
        "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
        // Public link → cacheable by shared caches for a short window.
        "Cache-Control": "public, max-age=300",
        // A shared file link should not be indexed by crawlers.
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load attachment",
      },
      { status: 404 },
    );
  }
}
