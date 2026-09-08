import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { SentryClient } from "@/lib/services/sentry-client";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    const { token, orgSlug, baseUrl } = await request.json();

    const trimmedToken = typeof token === "string" ? token.trim() : token;
    const trimmedOrg = typeof orgSlug === "string" ? orgSlug.trim() : orgSlug;

    if (!trimmedToken || !trimmedOrg) {
      return NextResponse.json(
        { error: "Sentry auth token and organization slug are required" },
        { status: 400 },
      );
    }

    // Authenticate the web session and resolve the acting user.
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate the credentials against the Sentry API before storing.
    const normalizedBaseUrl =
      typeof baseUrl === "string" && baseUrl.trim()
        ? baseUrl.trim()
        : "https://sentry.io";

    const sentry = new SentryClient({
      token: trimmedToken,
      orgSlug: trimmedOrg,
      baseUrl: normalizedBaseUrl,
    });

    let projects;
    try {
      projects = await sentry.listProjects();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return NextResponse.json(
        { error: "Invalid Sentry credentials", details: message },
        { status: 401 },
      );
    }

    // Persist the connection on the profile via the service-role client.
    const service = createServiceClient(supabaseUrl, supabaseServiceKey);
    const { error: updateError } = await service
      .from("profiles")
      .update({
        sentry_auth_token: trimmedToken,
        sentry_org_slug: trimmedOrg,
        sentry_base_url: normalizedBaseUrl,
        sentry_sync_enabled: true,
      })
      .eq("id", session.user.id);

    if (updateError) {
      console.error("Failed to update profile with Sentry connection:", updateError);
      return NextResponse.json(
        { error: "Failed to save Sentry connection" },
        { status: 500 },
      );
    }

    return NextResponse.json({ projects });
  } catch (error) {
    console.error("Sentry connection error:", error);
    return NextResponse.json(
      { error: "Failed to connect to Sentry" },
      { status: 500 },
    );
  }
}
