import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import { proposeRule } from "@/lib/email-inbox/server";
import type { RuleCandidate } from "@/lib/email-inbox/triage/propose";

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const body = (await request.json()) as RuleCandidate;
    const result = await proposeRule(auth.user.id, body);
    // Cap rejection is a client-actionable 409 (merge/remove a rule first).
    const status = result.outcome === "rejected_cap" ? 409 : 200;
    return NextResponse.json(result, { status });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to propose rule",
      },
      { status: 400 },
    );
  }
}
