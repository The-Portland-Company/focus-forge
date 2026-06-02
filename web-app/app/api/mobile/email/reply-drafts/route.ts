import { NextRequest, NextResponse } from "next/server";
import {
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import { listReplyDraftsForUser } from "@/lib/email-inbox/server";

// GET /api/mobile/email/reply-drafts
// Mobile Bearer-token mirror of /api/email/reply-drafts (GET).
// The reply queue: draft / scheduled / sending / sent / failed / canceled.
// Query params: status, mailboxId, projectId, source.
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
    const drafts = await listReplyDraftsForUser(auth.user.id, {
      status: sp.get("status") || undefined,
      mailboxId: sp.get("mailboxId") || undefined,
      projectId: sp.get("projectId") || undefined,
      source: sp.get("source") || undefined,
    });

    return NextResponse.json(
      mobileSuccess(drafts, { count: drafts.length }),
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      mobileFailure("internal_error", "Failed to load reply drafts", error),
      { status: 500 },
    );
  }
}
