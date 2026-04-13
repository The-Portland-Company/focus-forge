import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { listReplyDraftsForUser } from "@/lib/email-inbox/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const drafts = await listReplyDraftsForUser(auth.user.id, {
      status: request.nextUrl.searchParams.get("status") || undefined,
      mailboxId: request.nextUrl.searchParams.get("mailboxId") || undefined,
      projectId: request.nextUrl.searchParams.get("projectId") || undefined,
      source: request.nextUrl.searchParams.get("source") || undefined,
    });

    return NextResponse.json(drafts);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load reply drafts",
      },
      { status: 500 },
    );
  }
}
