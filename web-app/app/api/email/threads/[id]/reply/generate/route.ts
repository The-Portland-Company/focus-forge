import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { generateAiReplyForThread } from "@/lib/email-inbox/server";

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const body = await request.json().catch(() => ({}));
    const params = await props.params;
    const draft = await generateAiReplyForThread({
      userId: auth.user.id,
      threadId: params.id,
      override:
        body.override && typeof body.override === "object"
          ? body.override
          : undefined,
    });

    return NextResponse.json(draft, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to generate AI reply",
      },
      { status: 400 },
    );
  }
}
