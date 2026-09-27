import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/src/vendor/tpc-auth/oidc";
import { TPC_CLIENT_ID, TPC_RESOURCE } from "@/src/vendor/tpc-auth/config";
import { setSessionCookies } from "@/lib/auth/tpc-session";
import { getAppBaseUrl, sanitizeNextPath } from "@/lib/auth/urls";

// GET /auth/callback — TPC Auth's authorization-code redirect target. Reads
// back the { state, codeVerifier, next } stashed by /auth/login in the
// ff_oauth_flow cookie, exchanges the code for tokens bound to
// TPC_RESOURCE, and sets the session cookies. Replaces the old Supabase
// magic-link / OTP callback entirely — there is no local session store left.
const FLOW_COOKIE = "ff_oauth_flow";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const base = getAppBaseUrl({ requestUrl: request.url });

  const loginRedirect = (message: string) => {
    const dest = new URL("/auth/login", base);
    dest.searchParams.set("message", message);
    const res = NextResponse.redirect(dest);
    res.cookies.delete(FLOW_COOKIE);
    return res;
  };

  const err = url.searchParams.get("error");
  if (err) {
    return loginRedirect(
      url.searchParams.get("error_description") || "Sign-in failed. Please try again.",
    );
  }

  const raw = request.cookies.get(FLOW_COOKIE)?.value;
  let flow: { state: string; codeVerifier: string; next: string } | null = null;
  try {
    flow = raw ? JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) : null;
  } catch {
    flow = null;
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!flow || !code || !state || state !== flow.state) {
    return loginRedirect("This sign-in link is invalid or has expired. Start again.");
  }

  const redirectUri = `${base.replace(/\/$/, "")}/auth/callback`;

  try {
    const tokens = await exchangeCode({
      clientId: TPC_CLIENT_ID,
      code,
      redirectUri,
      codeVerifier: flow.codeVerifier,
      resource: TPC_RESOURCE,
    });
    await setSessionCookies(tokens);
  } catch {
    return loginRedirect("This sign-in link is invalid or has expired. Start again.");
  }

  const next = sanitizeNextPath(flow.next) ?? "/";
  const res = NextResponse.redirect(new URL(next, base));
  res.cookies.delete(FLOW_COOKIE);
  return res;
}
