import { NextRequest, NextResponse } from "next/server";
import {
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import { getSpamStats } from "@/lib/spam/server";

// GET /api/mobile/spam/stats?mailboxId=&organizationId=
// Bearer-token mirror of /api/spam/stats. Training-corpus counts + accuracy.
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get("authorization"),
      ["read", "write", "admin"],
    );
    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const stats = await getSpamStats({
      userId: auth.user.id,
      organizationId: searchParams.get("organizationId"),
      mailboxId: searchParams.get("mailboxId"),
    });
    return NextResponse.json(mobileSuccess(stats));
  } catch (error) {
    return NextResponse.json(
      mobileFailure("action_failed", "Failed to load spam stats", error),
      { status: 400 },
    );
  }
}
