import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { listSenderHistoryForUser } from "@/lib/email-inbox/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const email = request.nextUrl.searchParams.get("email") || "";
    const threads = await listSenderHistoryForUser(auth.user.id, email);
    return NextResponse.json(threads);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load sender history",
      },
      { status: 400 },
    );
  }
}
