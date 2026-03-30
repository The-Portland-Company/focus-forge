import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { getThreadDetailForUser } from "@/lib/email-inbox/server";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const params = await props.params;
    const thread = await getThreadDetailForUser(auth.user.id, params.id);
    return NextResponse.json(thread);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load thread",
      },
      { status: 404 },
    );
  }
}
