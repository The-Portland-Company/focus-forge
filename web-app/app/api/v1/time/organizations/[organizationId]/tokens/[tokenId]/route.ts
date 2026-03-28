import { NextRequest, NextResponse } from "next/server";
import { requireTimePrincipal } from "@/lib/time/auth";
import { ensureOrgTimeAdmin, revokeTimeToken } from "@/lib/time/server";

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ organizationId: string; tokenId: string }> },
) {
  const auth = await requireTimePrincipal(request, ["admin"]);
  if (auth.errorResponse || !auth.principal) {
    return auth.errorResponse!;
  }

  if (auth.principal.kind === "org_token") {
    return NextResponse.json(
      { error: { code: "forbidden", message: "Org tokens cannot revoke org tokens." } },
      { status: 403 },
    );
  }

  const params = await props.params;

  try {
    const isAdmin = await ensureOrgTimeAdmin(auth.principal.userId, params.organizationId);
    if (!isAdmin) {
      return NextResponse.json(
        { error: { code: "forbidden", message: "Forbidden." } },
        { status: 403 },
      );
    }

    await revokeTimeToken(params.organizationId, params.tokenId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(
      "DELETE /api/v1/time/organizations/[organizationId]/tokens/[tokenId] error:",
      error,
    );
    return NextResponse.json(
      { error: { code: "internal_error", message: "Failed to revoke time API token." } },
      { status: 500 },
    );
  }
}
