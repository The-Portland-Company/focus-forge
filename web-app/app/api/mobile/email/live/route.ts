import { NextRequest, NextResponse } from "next/server";
import {
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import { readMailboxLiveForUser } from "@/lib/email-inbox/server";

// GET /api/mobile/email/live
//
// The durable, no-HITL "check my email" endpoint. Reads a mailbox folder LIVE
// over IMAP — the true provider state (INBOX / All Mail / Spam / Trash), NOT
// Forge's synced + auto-classified copy that /email/inbox returns. Any tool
// with a Focus Forge PAT (Bartok on its droplet, an agent on any machine, the
// iOS/web clients) can call this; it never needs interactive re-auth because it
// reuses the app password Forge already stores encrypted.
//
// Query params:
//   folder    IMAP folder path (default INBOX; e.g. "[Gmail]/All Mail",
//             "[Gmail]/Spam", "[Gmail]/Trash")
//   limit     newest N to return (1-200, default 20)
//   search    subject OR from OR body match (returns matches instead of newest)
//   mailboxId scope to a specific mailbox (default: first Gmail mailbox)
//
// Auth: Bearer <mobile access token | Focus Forge PAT> with read scope.
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
    const folder = sp.get("folder") || undefined;
    const limitRaw = sp.get("limit");
    const limit = limitRaw ? Number(limitRaw) : undefined;
    const search = sp.get("search") || undefined;
    const mailboxId = sp.get("mailboxId") || undefined;

    const result = await readMailboxLiveForUser(auth.user.id, {
      mailboxId,
      folder,
      limit,
      search,
    });

    return NextResponse.json(
      mobileSuccess(result.messages, {
        mailboxId: result.mailboxId,
        mailbox: result.mailbox,
        provider: result.provider,
        folder: result.folder,
        total: result.total,
        unseen: result.unseen,
        matched: result.matched,
        count: result.messages.length,
        lastSyncedAt: result.lastSyncedAt,
      }),
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      mobileFailure(
        "email_live_read_failed",
        error instanceof Error ? error.message : "Failed to read mailbox",
        error,
      ),
      { status: 400 },
    );
  }
}
