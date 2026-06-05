import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { getMailboxStorageStatsForUser } from "@/lib/email-inbox/server";

export const dynamic = "force-dynamic";

/**
 * Per-mailbox email storage usage via IMAP QUOTA. Returns only mailboxes that
 * expose a quota (others are omitted). Results are cached server-side for 1h
 * per mailbox in getMailboxStorageStatsForUser.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const stats = await getMailboxStorageStatsForUser(auth.user.id);
    return NextResponse.json({ mailboxes: stats });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load storage stats",
      },
      { status: 500 },
    );
  }
}
