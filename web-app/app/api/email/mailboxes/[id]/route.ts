import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { deleteMailbox, updateMailboxSettings } from "@/lib/email-inbox/server";

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const params = await props.params;
    const body = await request.json();
    const mailbox = await updateMailboxSettings(auth.user.id, params.id, body);
    return NextResponse.json(mailbox);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update mailbox",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const params = await props.params;
    const result = await deleteMailbox(auth.user.id, params.id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to delete mailbox",
      },
      { status: 400 },
    );
  }
}
