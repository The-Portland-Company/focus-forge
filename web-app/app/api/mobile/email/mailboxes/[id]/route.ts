import { NextRequest, NextResponse } from "next/server";
import {
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import { updateMailboxSettings } from "@/lib/email-inbox/server";

// PATCH /api/mobile/email/mailboxes/[id]
// Bearer-token partial update of an existing mailbox. Only the fields present
// in the body are changed; stored credentials are left intact when `password`
// is omitted/empty. Powers per-mailbox editing + auto-sync frequency config.
// Requires manage-level access to the mailbox (enforced in
// `updateMailboxSettings` via `ensureMailboxManage`).
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get("authorization"),
      ["write", "admin"],
    );
    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }

    const params = await props.params;
    const body = await request.json();
    const mailbox = await updateMailboxSettings(auth.user.id, params.id, body);
    return NextResponse.json(mobileSuccess(mailbox), { status: 200 });
  } catch (error) {
    return NextResponse.json(
      mobileFailure(
        "mailbox_update_failed",
        error instanceof Error ? error.message : "Failed to update mailbox",
        error,
      ),
      { status: 400 },
    );
  }
}
