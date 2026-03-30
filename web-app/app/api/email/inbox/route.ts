import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import {
  listInboxItemsForUser,
  listMailboxesForUser,
  syncMailboxById,
} from "@/lib/email-inbox/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const mailboxes = await listMailboxesForUser(auth.user.id);
    const now = Date.now();

    await Promise.all(
      mailboxes.map(async (mailbox) => {
        if (!mailbox.autoSyncEnabled) return;
        const lastSyncedAt = mailbox.lastSyncedAt
          ? new Date(mailbox.lastSyncedAt).getTime()
          : 0;
        if (now - lastSyncedAt < mailbox.syncFrequencyMinutes * 60 * 1000)
          return;
        try {
          await syncMailboxById(auth.user.id, mailbox.id);
        } catch {
          return;
        }
      }),
    );

    const items = await listInboxItemsForUser(auth.user.id, {
      status: request.nextUrl.searchParams.get("status") || undefined,
      mailboxId: request.nextUrl.searchParams.get("mailboxId") || undefined,
      projectId: request.nextUrl.searchParams.get("projectId") || undefined,
    });
    return NextResponse.json(items);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load inbox",
      },
      { status: 500 },
    );
  }
}
