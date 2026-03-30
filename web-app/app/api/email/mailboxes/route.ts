import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { createMailbox, listMailboxesForUser } from "@/lib/email-inbox/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const mailboxes = await listMailboxesForUser(auth.user.id);
    return NextResponse.json(mailboxes);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load mailboxes",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const body = await request.json();
    const mailbox = await createMailbox(auth.user.id, body);
    return NextResponse.json(mailbox, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create mailbox",
      },
      { status: 400 },
    );
  }
}
