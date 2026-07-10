import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import {
  listContacts,
  createPersonalContact,
  type ContactScope,
} from "@/lib/email-inbox/contacts";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;
  try {
    const sp = request.nextUrl.searchParams;
    const scopeParam = (sp.get("scope") || "all") as ContactScope;
    const scope: ContactScope = ["all", "personal", "org"].includes(scopeParam)
      ? scopeParam
      : "all";
    const limit = sp.get("limit") ? parseInt(sp.get("limit")!, 10) : 100;
    const offset = sp.get("offset") ? parseInt(sp.get("offset")!, 10) : 0;
    const { contacts, total } = await listContacts({
      userId: auth.user.id,
      query: sp.get("q"),
      scope,
      limit,
      offset,
    });
    return NextResponse.json({ contacts, total });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load contacts" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;
  try {
    const body = await request.json();
    if (!body?.email || typeof body.email !== "string") {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }
    const contact = await createPersonalContact({
      userId: auth.user.id,
      input: {
        email: body.email,
        firstName: body.firstName ?? body.first_name ?? null,
        lastName: body.lastName ?? body.last_name ?? null,
        displayName: body.displayName ?? body.display_name ?? null,
        phone: body.phone ?? null,
        source: "manual",
      },
    });
    return NextResponse.json({ contact }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create contact" },
      { status: 500 },
    );
  }
}
