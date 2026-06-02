import { NextRequest, NextResponse } from "next/server";
import {
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import { createRule, listRulesForUser } from "@/lib/email-inbox/server";

// GET /api/mobile/email/rules
// Mobile Bearer-token mirror of /api/email/rules (GET). Returns the user's
// deterministic triage rules sorted by priority (== EmailRule[]).
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get("authorization"),
      ["read", "write", "admin"],
    );
    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }

    const rules = await listRulesForUser(auth.user.id);
    return NextResponse.json(mobileSuccess(rules, { count: rules.length }), {
      status: 200,
    });
  } catch (error) {
    return NextResponse.json(
      mobileFailure("internal_error", "Failed to load rules", error),
      { status: 500 },
    );
  }
}

// POST /api/mobile/email/rules
// Mobile Bearer-token mirror of /api/email/rules (POST). Body mirrors the web
// rule editor payload: { name, description?, mailboxId?, priority?, matchMode?,
// stopProcessing?, isActive?, conditions?, actions? }.
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get("authorization"),
      ["write", "admin"],
    );
    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }

    const body = await request.json().catch(() => ({}));
    const rule = await createRule(auth.user.id, body);
    return NextResponse.json(mobileSuccess(rule), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      mobileFailure("action_failed", "Failed to create rule", error),
      { status: 400 },
    );
  }
}
