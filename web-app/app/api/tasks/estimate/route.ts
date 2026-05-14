import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { estimateTaskMinutes } from "@/lib/ai-estimator/server";

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json(
      { error: "Task name is required" },
      { status: 400 },
    );
  }

  const description =
    typeof body?.description === "string" ? body.description : null;

  try {
    const result = await estimateTaskMinutes({ name, description });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to estimate task",
      },
      { status: 500 },
    );
  }
}
