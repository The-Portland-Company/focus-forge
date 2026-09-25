import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revoke } from "@/src/vendor/tpc-auth/oidc";
import { REFRESH_COOKIE, clearSessionCookies } from "@/lib/auth/tpc-session";

// POST /api/auth/logout — revokes the TPC refresh token (RFC 7009) and clears
// the session cookies. This ends Focus Forge's own cookie session; ending the
// IdP session too (single sign-out) happens by sending the browser to TPC
// Auth's logout endpoint, which the client does separately via
// `oidc.logoutUrl()` when a full sign-out (not just this app) is intended.
export async function POST() {
  try {
    const store = await cookies();
    const refreshToken = store.get(REFRESH_COOKIE)?.value;
    if (refreshToken) {
      await revoke(refreshToken).catch(() => {});
    }
    await clearSessionCookies();
    return NextResponse.json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json({ error: "Logout failed" }, { status: 500 });
  }
}
