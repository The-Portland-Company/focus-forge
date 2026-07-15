import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  verifyPasscode,
  isShareActive,
  shareCookieName,
  shareCookieValue,
} from "@/lib/project-share";

// POST: validate a passcode against the share's stored hash. On success sets a
// short-lived signed cookie proving the gate was cleared, then redirects back
// to the share page. The hash is never returned to the client.
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ token: string }> },
) {
  const { token } = await props.params;
  const form = await request.formData();
  const passcode = String(form.get("passcode") || "");

  // Prefer public host headers — request.url is often http://0.0.0.0:8080 on Railway.
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    "focusforge.theportlandcompany.com";
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const shareUrl = new URL(`/share/${token}`, `${proto}://${host}`);

  const admin = getAdminClient();
  const { data: share } = await admin
    .from("project_shares")
    .select("token,passcode_hash,revoked_at,expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!share || !isShareActive(share) || !share.passcode_hash) {
    // Nothing to unlock (or link dead) — bounce back; page renders its own state.
    return NextResponse.redirect(shareUrl, { status: 303 });
  }

  if (!verifyPasscode(passcode, share.passcode_hash)) {
    shareUrl.searchParams.set("error", "1");
    return NextResponse.redirect(shareUrl, { status: 303 });
  }

  const res = NextResponse.redirect(shareUrl, { status: 303 });
  res.cookies.set(shareCookieName(token), shareCookieValue(token), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/share/${token}`,
    maxAge: 60 * 60 * 12, // 12h
  });
  return res;
}
