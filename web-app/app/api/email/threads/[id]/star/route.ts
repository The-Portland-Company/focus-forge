import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { setThreadStarredForUser } from "@/lib/email-inbox/server";

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const params = await props.params;
    const body = (await request.json().catch(() => ({}))) as {
      isStarred?: boolean;
    };
    const result = await setThreadStarredForUser(
      auth.user.id,
      params.id,
      Boolean(body.isStarred),
    );
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update starred state",
      },
      { status: 400 },
    );
  }
}
