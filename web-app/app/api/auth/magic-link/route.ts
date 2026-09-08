import { NextResponse } from "next/server";
import { getAppBaseUrl, sanitizeNextPath } from "@/lib/auth/urls";
import { sendMagicLink } from "@/lib/auth/send-magic-link";

// Web magic-link sender. Generates the link with the admin API and sends it via
// Resend (NOT Supabase's shared mailer, which is capped at 2/hour). The emailed
// link points at /auth/callback carrying token_hash; that route verifies it.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body?.email || "").trim().toLowerCase();
    const next = sanitizeNextPath(body?.next);

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const base = getAppBaseUrl({ requestUrl: request.url });
    const redirectTo = next
      ? `${base}/auth/callback?next=${encodeURIComponent(next)}`
      : `${base}/auth/callback`;

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

    const { rateLimited } = await sendMagicLink({ email, redirectTo, ip });
    if (rateLimited) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a few minutes and try again." },
        { status: 429 },
      );
    }

    // Always report success — never reveal whether the account exists.
    return NextResponse.json({ sent: true }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Failed to send login link" },
      { status: 500 },
    );
  }
}
