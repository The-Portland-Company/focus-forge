import { NextRequest, NextResponse } from "next/server";
import { authorizeUrl } from "@/src/vendor/tpc-auth/oidc";
import { createPkcePair, randomState } from "@/src/vendor/tpc-auth/pkce";
import { TPC_CLIENT_ID, TPC_RESOURCE } from "@/src/vendor/tpc-auth/config";
import { getAppBaseUrl } from "@/lib/auth/urls";
import { sanitizeNextPath } from "@/lib/auth/urls";

// GET /auth/login — starts the TPC Auth authorization-code + PKCE flow.
// Focus Forge has no login screen of its own any more: this route just
// redirects the browser to https://auth.theportlandcompany.com/oauth/authorize
// and stashes { state, codeVerifier, next } in a short-lived httpOnly cookie
// that /auth/callback reads back. Mirrors Ads Control's src/lib/auth.ts.
const FLOW_COOKIE = "ff_oauth_flow";
const FLOW_TTL_S = 600;

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = sanitizeNextPath(url.searchParams.get("next")) ?? "/";
  const base = getAppBaseUrl({ requestUrl: request.url });
  const redirectUri = `${base.replace(/\/$/, "")}/auth/callback`;

  const state = randomState();
  const { codeVerifier } = await createPkcePair();

  const location = await authorizeUrl({
    clientId: TPC_CLIENT_ID,
    redirectUri,
    scope: "openid profile email offline_access",
    state,
    codeVerifier,
    resource: TPC_RESOURCE,
  });

  const res = NextResponse.redirect(location);
  res.cookies.set(
    FLOW_COOKIE,
    Buffer.from(JSON.stringify({ state, codeVerifier, next })).toString("base64url"),
    {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/auth",
      maxAge: FLOW_TTL_S,
    },
  );
  return res;
}
