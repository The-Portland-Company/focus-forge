import { NextRequest, NextResponse } from "next/server";
import {
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import { createMailbox, listMailboxesForUser } from "@/lib/email-inbox/server";

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

// POST /api/mobile/email/mailboxes
// Mobile Bearer-token mirror of /api/email/mailboxes (POST).
// Connects a new mailbox (or re-connects one with the same email address when
// the caller already manages it), wrapping the same `createMailbox` business
// logic the web route uses. Body matches the `createMailbox` input shape
// (provider, name, displayName, emailAddress, loginUsername, password,
// imap/smtp host+port, isShared, organizationId, syncFolder, autoSyncEnabled,
// syncFrequencyMinutes). Provider-aware password validation (e.g. Gmail App
// Password) is enforced server-side.
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get("authorization"),
      ["write", "admin"],
    );
    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }

    const body = await request.json();
    const mailbox = await createMailbox(auth.user.id, body);
    return NextResponse.json(mobileSuccess(mailbox), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      mobileFailure(
        "mailbox_create_failed",
        error instanceof Error ? error.message : "Failed to create mailbox",
        error,
      ),
      { status: 400 },
    );
  }
}
