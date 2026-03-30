import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { createRule, listRulesForUser } from "@/lib/email-inbox/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const rules = await listRulesForUser(auth.user.id);
    return NextResponse.json(rules);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load rules",
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
    const rule = await createRule(auth.user.id, body);
    return NextResponse.json(rule, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create rule",
      },
      { status: 400 },
    );
  }
}
