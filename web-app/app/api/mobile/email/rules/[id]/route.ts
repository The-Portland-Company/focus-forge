import { NextRequest, NextResponse } from "next/server";
import {
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import { updateRule } from "@/lib/email-inbox/server";

// PUT /api/mobile/email/rules/[id]
// Mobile Bearer-token mirror of /api/email/rules/[id] (PUT). Partial update of a
// single rule; body matches the web rule editor payload.
export async function PUT(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get("authorization"),
      ["write", "admin"],
    );
    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }

    const body = await request.json().catch(() => ({}));
    const params = await props.params;
    const rule = await updateRule(auth.user.id, params.id, body);
    return NextResponse.json(mobileSuccess(rule), { status: 200 });
  } catch (error) {
    return NextResponse.json(
      mobileFailure("action_failed", "Failed to update rule", error),
      { status: 400 },
    );
  }
}
