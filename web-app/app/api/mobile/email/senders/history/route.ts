import { NextRequest, NextResponse } from "next/server";
import {
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import { listSenderHistoryForUser } from "@/lib/email-inbox/server";

// GET /api/mobile/email/senders/history?email=
// Mobile Bearer-token mirror of /api/email/senders/history (GET). Returns the
// inbox threads (with conversation entries) for every message from a sender
// address — backs the iOS Sender History modal.
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get("authorization"),
      ["read", "write", "admin"],
    );
    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }

    const email = request.nextUrl.searchParams.get("email") || "";
    const threads = await listSenderHistoryForUser(auth.user.id, email);
    return NextResponse.json(
      mobileSuccess(threads, { count: threads.length, email }),
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      mobileFailure("internal_error", "Failed to load sender history", error),
      { status: 400 },
    );
  }
}
