import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  generateApiKeySecret,
  hashApiKeySecret,
  extractPrefixFromSecret,
} from "@/lib/api/keys/utils";

const DEFAULT_TOKEN_NAME = "default";
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function buildAgentPrompt(baseUrl: string, secret: string): string {
  return `You now have access to manage my Focus Forge account via its API.

Base URL: ${baseUrl}
Auth: send the header \`Authorization: Bearer ${secret}\` on every request.

You can read and manage my organizations, projects, task lists, and tasks.
Full endpoint reference (paths, methods, request/response shapes) is published at:
${baseUrl}/developer/api

Typical actions:
- List tasks:        GET  ${baseUrl}/api/mobile/tasks
- Create a task:     POST ${baseUrl}/api/mobile/tasks
- Update a task:     PATCH ${baseUrl}/api/mobile/tasks/{id}
- Complete a task:   PATCH ${baseUrl}/api/mobile/tasks/{id}  (body: {"completed": true})

Always confirm destructive actions before performing them, and keep this token secret.`;
}

// Idempotently runs the first-login agent onboarding: on the first call for a
// user it mints a "default" personal access token (1-year expiry) and returns
// the one-time secret plus a ready-to-paste agent prompt. Subsequent calls
// report that onboarding is already complete and never re-mint or re-reveal.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getAdminClient();

    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("agent_intro_seen_at")
      .eq("id", user.id)
      .single();

    if (profileError) {
      return NextResponse.json(
        { error: "Unable to load onboarding state." },
        { status: 500 },
      );
    }

    if (profile?.agent_intro_seen_at) {
      return NextResponse.json({ needed: false });
    }

    // Derive the base URL from the request host (authoritative for whatever
    // domain served this request). NEXT_PUBLIC_SITE_URL is baked at build time
    // and may point at localhost, so only use it as a secondary fallback.
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const host = request.headers.get("host");
    const requestOrigin =
      host
        ? `${forwardedProto || (host.startsWith("localhost") ? "http" : "https")}://${host}`
        : "";
    const baseUrl = (
      requestOrigin ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "https://focusforge.theportlandcompany.com"
    ).replace(/\/$/, "");

    const secret = generateApiKeySecret("ffk_pat_");
    const prefix = extractPrefixFromSecret(secret);
    const hashedKey = hashApiKeySecret(secret);
    const expiresAt = new Date(Date.now() + ONE_YEAR_MS).toISOString();

    const { error: createError } = await db
      .from("personal_access_tokens")
      .insert({
        name: DEFAULT_TOKEN_NAME,
        prefix,
        hashed_key: hashedKey,
        scopes: ["read", "write"],
        expires_at: expiresAt,
        created_by: user.id,
      } as any);

    if (createError) {
      return NextResponse.json(
        { error: createError.message || "Failed to create token." },
        { status: 500 },
      );
    }

    // Mark onboarding complete so the modal and token are one-time.
    const { error: markError } = await db
      .from("profiles")
      .update({ agent_intro_seen_at: new Date().toISOString() } as any)
      .eq("id", user.id);

    if (markError) {
      // Token was created; not fatal for the user, but surface a soft warning.
      console.error("agent-intro: failed to mark seen:", markError.message);
    }

    return NextResponse.json({
      needed: true,
      tokenName: DEFAULT_TOKEN_NAME,
      secret,
      expiresAt,
      prompt: buildAgentPrompt(baseUrl, secret),
    });
  } catch (error) {
    console.error("POST /api/onboarding/agent-intro error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
