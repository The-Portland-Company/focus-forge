import { getAdminClient } from "@/lib/supabase/admin";
import { sendMagicLinkEmail } from "@/lib/email";
import { buildMagicLinkUrl, checkRateLimit } from "@/lib/auth/magic-link";

// Modest self-send abuse ceiling: at most 5 links per email and per IP within
// 15 minutes (per instance). Enough to cover a legitimate "resend" tap while
// stopping a script from hammering the route (we are the sender now).
const MAX_PER_WINDOW = 5;
const WINDOW_MS = 15 * 60 * 1000;

export interface SendMagicLinkArgs {
  email: string;
  // Where the emailed link points — the web callback URL, or the iOS custom
  // scheme (focusforge://auth-callback).
  redirectTo: string;
  ip?: string | null;
}

export interface SendMagicLinkResult {
  // True only when the caller exceeded the rate limit. On every other outcome
  // (sent, or account does not exist) we report success to avoid enumeration.
  rateLimited: boolean;
}

// Generate a magic link with the admin API and email it ourselves via Resend,
// bypassing Supabase's shared mailer entirely. NEVER reveals whether the
// account exists: an unknown email (generateLink errors under no-signup) is
// logged and swallowed.
export async function sendMagicLink({
  email,
  redirectTo,
  ip,
}: SendMagicLinkArgs): Promise<SendMagicLinkResult> {
  const rl = checkRateLimit(`ml:email:${email}`, {
    max: MAX_PER_WINDOW,
    windowMs: WINDOW_MS,
  });
  const rlIp = ip
    ? checkRateLimit(`ml:ip:${ip}`, { max: MAX_PER_WINDOW * 3, windowMs: WINDOW_MS })
    : { allowed: true, retryAfterMs: 0 };

  if (!rl.allowed || !rlIp.allowed) {
    return { rateLimited: true };
  }

  try {
    const admin = getAdminClient();
    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });

    if (error || !data?.properties?.hashed_token) {
      // Unknown email under no-signup, or a transient admin error. Log for
      // diagnostics; report success regardless (no enumeration).
      console.warn("magic-link generateLink failed (suppressed):", error?.message);
      return { rateLimited: false };
    }

    const loginUrl = buildMagicLinkUrl(
      redirectTo,
      data.properties.hashed_token,
      "magiclink",
    );

    const { data: profile } = await admin
      .from("profiles")
      .select("first_name")
      .eq("email", email)
      .maybeSingle();

    await sendMagicLinkEmail({
      to: email,
      firstName: profile?.first_name || "",
      loginUrl,
    });
  } catch (err) {
    // Never surface send/generate failures to the caller — that would leak
    // account existence and internal state. Log and report success.
    console.error("magic-link send error (suppressed):", err);
  }

  return { rateLimited: false };
}
