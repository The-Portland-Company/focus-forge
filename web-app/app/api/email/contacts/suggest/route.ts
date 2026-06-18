import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { suggestRecipients } from "@/lib/email-inbox/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;
  try {
    const q = request.nextUrl.searchParams.get("q");
    const limitParamRaw = request.nextUrl.searchParams.get("limit");
    const limit = limitParamRaw
      ? Math.min(Math.max(parseInt(limitParamRaw, 10) || 8, 1), 25)
      : 8;
    const suggestions = await suggestRecipients({
      userId: auth.user.id,
      query: q,
      limit,
    });
    return NextResponse.json({ suggestions });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load recipient suggestions",
      },
      { status: 500 },
    );
  }
}
