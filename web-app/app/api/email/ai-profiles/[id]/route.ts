import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { updateSummaryProfile } from "@/lib/email-inbox/server";

export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const body = await request.json();
    const params = await props.params;
    const profile = await updateSummaryProfile(auth.user.id, params.id, body);
    return NextResponse.json(profile);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update AI profile",
      },
      { status: 400 },
    );
  }
}
