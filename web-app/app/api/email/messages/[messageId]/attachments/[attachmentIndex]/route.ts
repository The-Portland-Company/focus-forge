import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { getThreadAttachmentForUser } from "@/lib/email-inbox/server";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ messageId: string; attachmentIndex: string }> },
) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const params = await props.params;
    const attachmentIndex = Number(params.attachmentIndex);
    const attachment = await getThreadAttachmentForUser(
      auth.user.id,
      params.messageId,
      attachmentIndex,
    );

    return new NextResponse(attachment.content, {
      headers: {
        "Content-Type": attachment.contentType || "application/octet-stream",
        "Content-Disposition": `${attachment.contentDisposition === "inline" ? "inline" : "attachment"}; filename="${encodeURIComponent(attachment.filename || "attachment")}"`,
        "Cache-Control": "private, max-age=300",
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
