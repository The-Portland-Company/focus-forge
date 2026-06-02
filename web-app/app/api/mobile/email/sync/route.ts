import { NextRequest, NextResponse } from "next/server";
import {
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import {
  syncDueMailboxesForUser,
  syncMailboxById,
} from "@/lib/email-inbox/server";

// POST /api/mobile/email/sync
// Mobile Bearer-token mirror of:
//   - /api/email/mailboxes/[id]/sync (single mailbox)  -> body { mailboxId }
//   - /api/email/mailboxes/sync-due  (all "due" boxes) -> body { mode: "due" } or empty
// Body:
//   { mailboxId: string }            -> sync one mailbox
//   { mode: "due" } | {}             -> sync all auto-sync mailboxes that are due
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
    const mailboxId =
      typeof body.mailboxId === "string" ? body.mailboxId : undefined;

    if (mailboxId) {
      const result = await syncMailboxById(auth.user.id, mailboxId);
      return NextResponse.json(
        mobileSuccess({ mode: "single", mailboxId, ...result }),
        { status: 200 },
      );
    }

    const result = await syncDueMailboxesForUser(auth.user.id);
    return NextResponse.json(mobileSuccess({ mode: "due", ...result }), {
      status: 200,
    });
  } catch (error) {
    return NextResponse.json(
      mobileFailure("sync_failed", "Failed to sync mailbox(es)", error),
      { status: 400 },
    );
  }
}
