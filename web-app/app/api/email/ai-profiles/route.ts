import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import {
  createSummaryProfile,
  listSummaryProfilesForUser,
} from "@/lib/email-inbox/server";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const profiles = await listSummaryProfilesForUser(auth.user.id);
    return NextResponse.json(profiles);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load profiles",
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
    const profile = await createSummaryProfile(auth.user.id, body);
    return NextResponse.json(profile, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create AI profile",
      },
      { status: 400 },
    );
  }
}
