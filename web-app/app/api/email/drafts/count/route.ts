import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { getDraftCountForUser } from "@/lib/email-inbox/server";

// GET /api/email/drafts/count → { count } — unsent drafts across the user's
// mailboxes, for the sidebar's Drafts badge.
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const count = await getDraftCountForUser(auth.user.id);
    return NextResponse.json({ count });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load draft count",
      },
      { status: 500 },
    );
  }
}
