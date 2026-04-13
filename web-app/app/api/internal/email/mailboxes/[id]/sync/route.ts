import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { syncMailboxById } from "@/lib/email-inbox/server";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { isValidLiveSyncToken } = require("@/lib/email-inbox/live-sync-auth.js");

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const params = await props.params;
    const token = request.headers.get("x-email-live-sync-token");

    if (!isValidLiveSyncToken(params.id, token)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getAdminClient();
    const { data: mailbox } = await admin
      .from("mailboxes")
      .select("id,owner_user_id")
      .eq("id", params.id)
      .maybeSingle();

    if (!mailbox?.id || !mailbox.owner_user_id) {
      return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
    }

    const result = await syncMailboxById(String(mailbox.owner_user_id), params.id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to sync mailbox",
      },
      { status: 500 },
    );
  }
}
