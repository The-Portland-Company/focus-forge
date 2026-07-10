import { NextRequest, NextResponse } from "next/server";
import {
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import {
  listContacts,
  createPersonalContact,
  type ContactScope,
} from "@/lib/email-inbox/contacts";

// GET /api/mobile/email/contacts?q=&scope=  — Bearer-token mirror of /api/email/contacts.
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get("authorization"),
      ["read", "write", "admin"],
    );
    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }
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
    return NextResponse.json(mobileSuccess(contacts, { total }), { status: 200 });
  } catch (error) {
    return NextResponse.json(
      mobileFailure(
        "server_error",
        error instanceof Error ? error.message : "Failed to load contacts",
      ),
      { status: 500 },
    );
  }
}

// POST /api/mobile/email/contacts — create a personal contact.
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get("authorization"),
      ["write", "admin"],
    );
    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }
    const body = await request.json();
    if (!body?.email || typeof body.email !== "string") {
      return NextResponse.json(mobileFailure("bad_request", "email is required"), {
        status: 400,
      });
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
    return NextResponse.json(mobileSuccess(contact), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      mobileFailure(
        "server_error",
        error instanceof Error ? error.message : "Failed to create contact",
      ),
      { status: 500 },
    );
  }
}
