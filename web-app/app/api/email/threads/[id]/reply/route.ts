import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { replyToThread } from "@/lib/email-inbox/server";

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const body = await request.json();
    const params = await props.params;
    const result = await replyToThread({
      userId: auth.user.id,
      threadId: params.id,
      content: body.content,
      mode: body.mode === "internal_note" ? "internal_note" : "reply_all",
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to reply" },
      { status: 400 },
    );
  }
}
