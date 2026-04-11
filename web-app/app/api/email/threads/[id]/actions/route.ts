import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import {
  applyThreadAction,
  getThreadDetailForUser,
} from "@/lib/email-inbox/server";

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const body = await request.json();
    const params = await props.params;
    const result = await applyThreadAction({
      userId: auth.user.id,
      threadId: params.id,
      action: body.action,
    });
    if (body.action === "reprocess") {
      const detail = await getThreadDetailForUser(auth.user.id, params.id);
      return NextResponse.json(detail);
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to apply action",
      },
      { status: 400 },
    );
  }
}
