import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { revertSpamExceptionRule } from "@/lib/email-inbox/server";

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ ruleId: string }> },
) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const body = await request.json();
    const params = await props.params;
    const result = await revertSpamExceptionRule({
      userId: auth.user.id,
      ruleId: params.ruleId,
      threadId: String(body.threadId || ""),
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to revert spam exception",
      },
      { status: 400 },
    );
  }
}
