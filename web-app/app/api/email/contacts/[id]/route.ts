import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import {
  updatePersonalContact,
  deletePersonalContact,
} from "@/lib/email-inbox/contacts";

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;
  try {
    const params = await props.params;
    const body = await request.json();
    const contact = await updatePersonalContact({
      userId: auth.user.id,
      id: params.id,
      patch: {
        email: body.email,
        firstName: body.firstName ?? body.first_name,
        lastName: body.lastName ?? body.last_name,
        displayName: body.displayName ?? body.display_name,
        phone: body.phone,
      },
    });
    if (!contact) {
      return NextResponse.json(
        { error: "Contact not found or not editable" },
        { status: 404 },
      );
    }
    return NextResponse.json({ contact });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update contact" },
      { status: 500 },
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
    const deleted = await deletePersonalContact({
      userId: auth.user.id,
      id: params.id,
    });
    if (!deleted) {
      return NextResponse.json(
        { error: "Contact not found or not deletable" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete contact" },
      { status: 500 },
    );
  }
}
