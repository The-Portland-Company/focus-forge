import { NextRequest, NextResponse } from "next/server";
import {
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import { listMailboxesForUser } from "@/lib/email-inbox/server";

// GET /api/mobile/email/mailboxes
// Mobile Bearer-token mirror of /api/email/mailboxes (GET).
// Returns the user's mailboxes including last-sync time + per-box sync error.
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get("authorization"),
      ["read", "write", "admin"],
    );
    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }

    const mailboxes = await listMailboxesForUser(auth.user.id);
    return NextResponse.json(
      mobileSuccess(mailboxes, { count: mailboxes.length }),
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      mobileFailure("internal_error", "Failed to load mailboxes", error),
      { status: 500 },
    );
  }
}
