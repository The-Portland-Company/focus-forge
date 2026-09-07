import { sanitizeNextPath } from "./urls";

// A magic-link (email OTP) callback arrives in one of three shapes, mirroring
// the recovery-link handling in app/auth/reset-password:
//   1. PKCE flow      -> ?code=...            (default for the SSR browser
//                        client with flowType: 'pkce') -> exchangeCodeForSession
//   2. Token-hash     -> ?token_hash=...&type=magiclink|email -> verifyOtp
//   3. Error          -> ?error=...&error_description=...
//
// This pure planner turns the incoming query string into a decision so the
// route handler stays a thin wrapper and the branching is unit-testable
// without mocking Supabase.
export type MagicLinkPlan =
  | { action: "exchange-code"; code: string; next: string }
  | {
      action: "verify-otp";
      tokenHash: string;
      type: string;
      next: string;
    }
  | { action: "error"; message: string };

const DEFAULT_NEXT = "/today";

export function planMagicLinkCallback(
  params: URLSearchParams,
): MagicLinkPlan {
  const errorDescription =
    params.get("error_description") || params.get("error");
  if (errorDescription) {
    return {
      action: "error",
      message: decodeURIComponent(errorDescription.replace(/\+/g, " ")),
    };
  }

  const next = sanitizeNextPath(params.get("next")) ?? DEFAULT_NEXT;

  const code = params.get("code");
  if (code) {
    return { action: "exchange-code", code, next };
  }

  const tokenHash = params.get("token_hash");
  if (tokenHash) {
    // Supabase magic links default to type "magiclink"; the newer unified
    // template sends type "email". Preserve whatever the link carries.
    const type = params.get("type") || "magiclink";
    return { action: "verify-otp", tokenHash, type, next };
  }

  return {
    action: "error",
    message:
      "This sign-in link is invalid or has expired. Request a new login link.",
  };
}
