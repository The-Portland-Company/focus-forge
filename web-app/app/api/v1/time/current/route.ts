import { NextRequest, NextResponse } from "next/server";
import { requireTimePrincipal } from "@/lib/time/auth";
import { getCurrentTimeEntry } from "@/lib/time/server";

export async function GET(request: NextRequest) {
  const auth = await requireTimePrincipal(request, ["read"]);
  if (auth.errorResponse || !auth.principal) {
    return auth.errorResponse!;
  }

  const requestedUserId = request.nextUrl.searchParams.get("userId");

  try {
    const entry =
      auth.principal.kind === "org_token"
        ? await getCurrentTimeEntry(auth.principal, requestedUserId)
        : await getCurrentTimeEntry(auth.principal, requestedUserId || auth.principal.userId);

    return NextResponse.json({ data: entry });
  } catch (error) {
    console.error("GET /api/v1/time/current error:", error);
    return NextResponse.json(
      { error: { code: "internal_error", message: "Failed to load current timer." } },
      { status: 500 },
    );
  }
}
