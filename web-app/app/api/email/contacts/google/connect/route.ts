import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api/authz";
import {
  isGoogleConfigured,
  buildGoogleAuthUrl,
} from "@/lib/email-inbox/google-contacts";

// Kicks off Google OAuth. Returns the consent URL as JSON (client opens it) so the SPA
// can control the redirect. State carries the user id to bind the callback.
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("errorResponse" in auth) return auth.errorResponse;
  if (!isGoogleConfigured()) {
    return NextResponse.json(
      {
        error:
          "Google contact import is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
        configured: false,
      },
      { status: 501 },
    );
  }
  const state = Buffer.from(
    JSON.stringify({ userId: auth.user.id, t: Date.now() }),
  ).toString("base64url");
  const url = buildGoogleAuthUrl(state);
  return NextResponse.json({ url, configured: true });
}
