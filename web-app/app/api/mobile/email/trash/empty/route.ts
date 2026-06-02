import { NextRequest, NextResponse } from "next/server";
import {
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import { emptyTrashForUser } from "@/lib/email-inbox/server";

// POST /api/mobile/email/trash/empty
// Mobile Bearer-token mirror of /api/email/trash/empty (POST).
// Body: { mailboxId?: string } — omit (or "all") to empty trash across every
// mailbox the user manages; pass a single mailbox id to scope it.
// Returns: { success, deletedThreadCount, mailboxCount }.
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
    const rawMailboxId =
      typeof body?.mailboxId === "string" ? body.mailboxId.trim() : "";
    const mailboxId =
      rawMailboxId && rawMailboxId !== "all" ? rawMailboxId : null;

    const result = await emptyTrashForUser({
      userId: auth.user.id,
      mailboxId,
    });

    return NextResponse.json(mobileSuccess(result), { status: 200 });
  } catch (error) {
    return NextResponse.json(
      mobileFailure("action_failed", "Failed to empty trash", error),
      { status: 400 },
    );
  }
}
