import { NextRequest, NextResponse } from "next/server";
import {
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import { getUnreadBadgeCountForUser } from "@/lib/email-inbox/server";

// GET /api/mobile/email/unread-count
// Mobile Bearer-token mirror of /api/email/unread-count (GET).
// Lightweight unread count for the app badge.
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get("authorization"),
      ["read", "write", "admin"],
    );
    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }

    const count = await getUnreadBadgeCountForUser(auth.user.id);
    return NextResponse.json(mobileSuccess({ count }), { status: 200 });
  } catch (error) {
    return NextResponse.json(
      mobileFailure("internal_error", "Failed to load unread count", error),
      { status: 500 },
    );
  }
}
