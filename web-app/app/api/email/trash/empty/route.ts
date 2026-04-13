import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { emptyTrashForUser } from "@/lib/email-inbox/server";

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const body = await request.json().catch(() => ({}));
    const result = await emptyTrashForUser({
      userId: auth.user.id,
      mailboxId:
        typeof body?.mailboxId === "string" && body.mailboxId.trim()
          ? body.mailboxId
          : null,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to empty trash",
      },
      { status: 400 },
    );
  }
}
