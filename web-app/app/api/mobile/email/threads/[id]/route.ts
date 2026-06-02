import { NextRequest, NextResponse } from "next/server";
import {
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import { getThreadDetailForUser } from "@/lib/email-inbox/server";

// GET /api/mobile/email/threads/[id]
// Mobile Bearer-token mirror of /api/email/threads/[id] (GET).
// Returns full thread detail: inbox-item fields + conversation (messages +
// attachments) + linkedTasks + activeReplyDraft.
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get("authorization"),
      ["read", "write", "admin"],
    );
    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }

    const params = await props.params;
    const thread = await getThreadDetailForUser(auth.user.id, params.id);
    return NextResponse.json(mobileSuccess(thread), { status: 200 });
  } catch (error) {
    return NextResponse.json(
      mobileFailure("not_found", "Failed to load thread", error),
      { status: 404 },
    );
  }
}
