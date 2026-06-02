import { NextRequest, NextResponse } from "next/server";
import {
  mobileFailure,
  mobileSuccess,
  verifyMobileAccessTokenOrPat,
} from "@/lib/mobile/api";
import {
  createSummaryProfile,
  listSummaryProfilesForUser,
} from "@/lib/email-inbox/server";

// GET /api/mobile/email/ai-profiles
// Mobile Bearer-token mirror of /api/email/ai-profiles (GET). Returns the user's
// AI summary profiles (Email AI Lab); falls back to a synthetic default profile
// when none exist (mirrors listSummaryProfilesForUser).
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyMobileAccessTokenOrPat(
      request.headers.get("authorization"),
      ["read", "write", "admin"],
    );
    if (!auth.ok) {
      return NextResponse.json(auth.error, { status: auth.status });
    }

    const profiles = await listSummaryProfilesForUser(auth.user.id);
    return NextResponse.json(
      mobileSuccess(profiles, { count: profiles.length }),
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      mobileFailure("internal_error", "Failed to load AI profiles", error),
      { status: 500 },
    );
  }
}

// POST /api/mobile/email/ai-profiles
// Mobile Bearer-token mirror of /api/email/ai-profiles (POST). Body mirrors the
// web AI Lab editor: { name, mailboxId?, summaryStyle?, instructionText?,
// settings?, isDefault? }.
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
    const profile = await createSummaryProfile(auth.user.id, body);
    return NextResponse.json(mobileSuccess(profile), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      mobileFailure("action_failed", "Failed to create AI profile", error),
      { status: 400 },
    );
  }
}
