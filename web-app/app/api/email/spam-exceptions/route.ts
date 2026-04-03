import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { createSpamExceptionRuleForThread } from "@/lib/email-inbox/server";

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const body = await request.json();
    const result = await createSpamExceptionRuleForThread(
      auth.user.id,
      String(body.threadId || ""),
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create spam exception",
      },
      { status: 400 },
    );
  }
}
