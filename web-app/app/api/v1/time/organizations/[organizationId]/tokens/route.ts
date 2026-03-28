import { NextRequest, NextResponse } from "next/server";
import { requireTimePrincipal } from "@/lib/time/auth";
import { createTimeToken, ensureOrgTimeAdmin, listTimeTokens } from "@/lib/time/server";
import { mapTimeScopes } from "@/lib/time/utils";

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ organizationId: string }> },
) {
  const auth = await requireTimePrincipal(request, ["read"]);
  if (auth.errorResponse || !auth.principal) {
    return auth.errorResponse!;
  }

  const params = await props.params;
  if (auth.principal.kind === "org_token") {
    return NextResponse.json(
      { error: { code: "forbidden", message: "Org tokens cannot manage org tokens." } },
      { status: 403 },
    );
  }

  try {
    const isAdmin = await ensureOrgTimeAdmin(auth.principal.userId, params.organizationId);
    if (!isAdmin) {
      return NextResponse.json(
        { error: { code: "forbidden", message: "Forbidden." } },
        { status: 403 },
      );
    }

    const tokens = await listTimeTokens(params.organizationId);
    return NextResponse.json({ data: tokens });
  } catch (error) {
    console.error("GET /api/v1/time/organizations/[organizationId]/tokens error:", error);
    return NextResponse.json(
      { error: { code: "internal_error", message: "Failed to load time API tokens." } },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ organizationId: string }> },
) {
  const auth = await requireTimePrincipal(request, ["admin"]);
  if (auth.errorResponse || !auth.principal) {
    return auth.errorResponse!;
  }

  const params = await props.params;
  if (auth.principal.kind === "org_token") {
    return NextResponse.json(
      { error: { code: "forbidden", message: "Org tokens cannot create org tokens." } },
      { status: 403 },
    );
  }

  try {
    const isAdmin = await ensureOrgTimeAdmin(auth.principal.userId, params.organizationId);
    if (!isAdmin) {
      return NextResponse.json(
        { error: { code: "forbidden", message: "Forbidden." } },
        { status: 403 },
      );
    }

    const body = await request.json();
    const token = await createTimeToken({
      organizationId: params.organizationId,
      createdBy: auth.principal.userId,
      name: String(body.name || "").trim(),
      description: typeof body.description === "string" ? body.description.trim() : null,
      scopes: mapTimeScopes(body.scopes),
      expiresAt: new Date(body.expiresAt).toISOString(),
      shareMode:
        body.shareMode === "organization" || body.shareMode === "selected"
          ? body.shareMode
          : "private",
      sharedUserIds: Array.isArray(body.sharedUserIds) ? body.sharedUserIds : [],
      sharedGroupIds: Array.isArray(body.sharedGroupIds) ? body.sharedGroupIds : [],
    });

    return NextResponse.json({ data: token }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/v1/time/organizations/[organizationId]/tokens error:", error);
    return NextResponse.json(
      {
        error: {
          code: "internal_error",
          message: error?.message || "Failed to create time API token.",
        },
      },
      { status: 500 },
    );
  }
}
