import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  storeGoogleAccount,
  isGoogleConfigured,
} from "@/lib/email-inbox/google-contacts";

// OAuth redirect target. Google redirects here with ?code&state. We exchange the code,
// store encrypted tokens bound to the user id in `state`, then bounce back to the inbox
// with a status flag the UI can react to. (State-derived userId; no session needed since
// Google's redirect is a top-level GET without our auth cookie guaranteed.)
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const code = sp.get("code");
  const stateRaw = sp.get("state");
  const errorParam = sp.get("error");
  const inboxUrl = new URL("/inbox", request.nextUrl.origin);

  if (errorParam) {
    inboxUrl.searchParams.set("google", "error");
    return NextResponse.redirect(inboxUrl);
  }
  if (!code || !stateRaw || !isGoogleConfigured()) {
    inboxUrl.searchParams.set("google", "error");
    return NextResponse.redirect(inboxUrl);
  }

  try {
    const state = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf8"));
    const userId = state?.userId;
    if (!userId) throw new Error("Invalid state");

    const tokens = await exchangeCodeForTokens(code);
    await storeGoogleAccount({ userId, tokens });

    inboxUrl.searchParams.set("google", "connected");
    return NextResponse.redirect(inboxUrl);
  } catch {
    inboxUrl.searchParams.set("google", "error");
    return NextResponse.redirect(inboxUrl);
  }
}
