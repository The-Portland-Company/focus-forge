import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { planMagicLinkCallback } from "@/lib/auth/magic-link-callback";

// Magic-link (passwordless email OTP) callback. Supabase redirects the email
// link here; we establish the session cookie, then hand off to the app. The
// MFA gate is enforced by middleware — a magic-link user who has TOTP enrolled
// is still bounced to /auth/mfa on the next request because the session lands
// at aal1. We deliberately do NOT special-case MFA here.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const plan = planMagicLinkCallback(url.searchParams);

  const loginRedirect = (message: string) => {
    const dest = new URL("/auth/login", url.origin);
    dest.searchParams.set("message", message);
    return NextResponse.redirect(dest);
  };

  if (plan.action === "error") {
    return loginRedirect(plan.message);
  }

  const supabase = await createClient();

  if (plan.action === "exchange-code") {
    const { error } = await supabase.auth.exchangeCodeForSession(plan.code);
    if (error) {
      return loginRedirect(
        "This sign-in link is invalid or has expired. Request a new login link.",
      );
    }
    return NextResponse.redirect(new URL(plan.next, url.origin));
  }

  // token_hash flow
  const { error } = await supabase.auth.verifyOtp({
    type: plan.type as EmailOtpType,
    token_hash: plan.tokenHash,
  });
  if (error) {
    return loginRedirect(
      "This sign-in link is invalid or has expired. Request a new login link.",
    );
  }
  return NextResponse.redirect(new URL(plan.next, url.origin));
}
