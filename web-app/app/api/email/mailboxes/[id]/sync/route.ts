import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { syncMailboxById } from "@/lib/email-inbox/server";

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const params = await props.params;
    const result = await syncMailboxById(auth.user.id, params.id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to sync mailbox",
      },
      { status: 400 },
    );
  }
}
