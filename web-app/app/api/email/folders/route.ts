import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { listMailboxesForUser } from "@/lib/email-inbox/server";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  listMailboxFolders,
  type MailboxFolderInfo,
  type MailboxTransportRow,
} from "@/lib/email-inbox/provider";

export const dynamic = "force-dynamic";

/**
 * Live IMAP folder list (with per-folder unread/read counts) for the user's
 * mailboxes. Backs the "Folders" submenu under Email Inbox in the sidebar.
 *
 * GET /api/email/folders            → folders for every accessible mailbox
 * GET /api/email/folders?mailboxId= → folders for a single mailbox
 *
 * Each mailbox is resolved independently: a connection/auth failure on one
 * mailbox returns an `error` string for that mailbox instead of failing the
 * whole response. Results are cached in-process per mailbox (IMAP LIST+STATUS
 * is slow and rate-limited) so repeated sidebar mounts don't hammer the server.
 */

type FolderCacheEntry = {
  fetchedAt: number;
  folders: MailboxFolderInfo[];
  error: string | null;
};

const FOLDER_CACHE_TTL_MS = 90 * 1000; // ~90s
const folderCache = new Map<string, FolderCacheEntry>();

type MailboxFoldersResponse = {
  mailboxId: string;
  emailAddress: string;
  folders: MailboxFolderInfo[];
  error?: string;
};

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  const requestedMailboxId = request.nextUrl.searchParams.get("mailboxId");

  try {
    // Access control: only mailboxes this user can actually see. This reuses
    // the same visibility rules as the rest of the email surface.
    const accessible = await listMailboxesForUser(auth.user.id);
    const scoped = requestedMailboxId
      ? accessible.filter((m) => String(m.id) === String(requestedMailboxId))
      : accessible;

    if (scoped.length === 0) {
      return NextResponse.json({ mailboxes: [] });
    }

    // Pull the raw transport rows (with encrypted credentials) only for the
    // mailbox ids that already passed the visibility check above.
    const admin = getAdminClient();
    const { data: rows } = await admin
      .from("mailboxes")
      .select("*")
      .in(
        "id",
        scoped.map((m) => String(m.id)),
      );
    const rowsById = new Map<string, MailboxTransportRow>(
      ((rows || []) as MailboxTransportRow[]).map((row) => [
        String(row.id),
        row,
      ]),
    );

    const now = Date.now();

    const mailboxes: MailboxFoldersResponse[] = await Promise.all(
      scoped.map(async (mailbox): Promise<MailboxFoldersResponse> => {
        const mailboxId = String(mailbox.id);
        const emailAddress =
          mailbox.emailAddress || mailbox.displayName || "Mailbox";

        const cached = folderCache.get(mailboxId);
        if (cached && now - cached.fetchedAt < FOLDER_CACHE_TTL_MS) {
          return {
            mailboxId,
            emailAddress,
            folders: cached.folders,
            ...(cached.error ? { error: cached.error } : {}),
          };
        }

        const row = rowsById.get(mailboxId);
        if (!row || !row.imap_host) {
          const error = "This mailbox does not support IMAP folder listing.";
          folderCache.set(mailboxId, { fetchedAt: now, folders: [], error });
          return { mailboxId, emailAddress, folders: [], error };
        }

        try {
          const folders = await listMailboxFolders(row);
          folderCache.set(mailboxId, { fetchedAt: now, folders, error: null });
          return { mailboxId, emailAddress, folders };
        } catch (err) {
          const error =
            err instanceof Error ? err.message : "Failed to list folders.";
          folderCache.set(mailboxId, { fetchedAt: now, folders: [], error });
          return { mailboxId, emailAddress, folders: [], error };
        }
      }),
    );

    return NextResponse.json({ mailboxes });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load folders",
      },
      { status: 500 },
    );
  }
}
