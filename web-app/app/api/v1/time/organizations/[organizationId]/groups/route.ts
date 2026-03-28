import { NextRequest, NextResponse } from "next/server";
import { requireTimePrincipal } from "@/lib/time/auth";
import { createTimeGroup, ensureOrgTimeAdmin, listTimeGroups } from "@/lib/time/server";

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
      { error: { code: "forbidden", message: "Org tokens cannot list token groups." } },
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

    const groups = await listTimeGroups(params.organizationId);
    return NextResponse.json({ data: groups });
  } catch (error) {
    console.error("GET /api/v1/time/organizations/[organizationId]/groups error:", error);
    return NextResponse.json(
      { error: { code: "internal_error", message: "Failed to load groups." } },
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
  const actingUserId =
    auth.principal.kind === "org_token" ? auth.principal.createdBy : auth.principal.userId;

  try {
    const isAdmin = await ensureOrgTimeAdmin(actingUserId, params.organizationId);
    if (!isAdmin) {
      return NextResponse.json(
        { error: { code: "forbidden", message: "Forbidden." } },
        { status: 403 },
      );
    }

    const body = await request.json();
    const group = await createTimeGroup({
      organizationId: params.organizationId,
      createdBy: actingUserId,
      name: String(body.name || "").trim(),
      description: typeof body.description === "string" ? body.description.trim() : null,
      memberIds: Array.isArray(body.memberIds) ? body.memberIds : [],
    });

    return NextResponse.json({ data: group }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/v1/time/organizations/[organizationId]/groups error:", error);
    return NextResponse.json(
      {
        error: {
          code: "internal_error",
          message: error?.message || "Failed to create group.",
        },
      },
      { status: 500 },
    );
  }
}
