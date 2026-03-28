import { NextResponse } from "next/server";
import { requireTimePrincipal } from "@/lib/time/auth";
import { getTimeBootstrap } from "@/lib/time/server";

export async function GET(request: Request) {
  const auth = await requireTimePrincipal(request as any, ["read"]);
  if (auth.errorResponse || !auth.principal) {
    return auth.errorResponse!;
  }

  if (auth.principal.kind === "org_token") {
    return NextResponse.json(
      { error: { code: "forbidden", message: "Org tokens cannot load user bootstrap." } },
      { status: 403 },
    );
  }

  try {
    const bootstrap = await getTimeBootstrap(auth.principal.userId);
    return NextResponse.json({ data: bootstrap });
  } catch (error) {
    console.error("GET /api/v1/time/bootstrap error:", error);
    return NextResponse.json(
      { error: { code: "internal_error", message: "Failed to load time bootstrap." } },
      { status: 500 },
    );
  }
}
