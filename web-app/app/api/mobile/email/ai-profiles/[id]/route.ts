import { NextRequest, NextResponse } from "next/server";
import {
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import { updateSummaryProfile } from "@/lib/email-inbox/server";

// PUT /api/mobile/email/ai-profiles/[id]
// Mobile Bearer-token mirror of /api/email/ai-profiles/[id] (PUT). Partial update
// of a single AI summary profile.
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
    const profile = await updateSummaryProfile(auth.user.id, params.id, body);
    return NextResponse.json(mobileSuccess(profile), { status: 200 });
  } catch (error) {
    return NextResponse.json(
      mobileFailure("action_failed", "Failed to update AI profile", error),
      { status: 400 },
    );
  }
}
