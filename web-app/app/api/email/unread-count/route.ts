import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { getUnreadBadgeCountForUser } from "@/lib/email-inbox/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const count = await getUnreadBadgeCountForUser(auth.user.id);
    return NextResponse.json({ count });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load unread count",
      },
      { status: 500 },
    );
  }
}
