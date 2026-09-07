import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { SupabaseAdapter } from "@/lib/db/supabase-adapter";
import { SentryClient } from "@/lib/services/sentry-client";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const connectionId: string | undefined = body?.connectionId;

    // Authenticate the web session.
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const service = createServiceClient(supabaseUrl, supabaseServiceKey);

    // Load the caller's Sentry credentials from their profile.
    const { data: profile, error: profileError } = await service
      .from("profiles")
      .select("sentry_auth_token, sentry_org_slug, sentry_base_url")
      .eq("id", userId)
      .single();

    if (profileError || !profile?.sentry_auth_token) {
      return NextResponse.json(
        { error: "Sentry not connected. Please connect Sentry first." },
        { status: 400 },
      );
    }

    // Load the connections to sync.
    let connectionQuery = service
      .from("sentry_connections")
      .select("*")
      .eq("user_id", userId)
      .eq("sync_enabled", true);

    if (connectionId) {
      connectionQuery = connectionQuery.eq("id", connectionId);
    }

    const { data: connections, error: connectionsError } =
      await connectionQuery;

    if (connectionsError) {
      console.error("Failed to load Sentry connections:", connectionsError);
      return NextResponse.json(
        { error: "Failed to load connections" },
        { status: 500 },
      );
    }

    const adapter = new SupabaseAdapter(supabase, userId);

    let created = 0;
    let skipped = 0;

    for (const conn of connections ?? []) {
      const sentry = new SentryClient({
        token: profile.sentry_auth_token,
        orgSlug: conn.sentry_org_slug,
        baseUrl: profile.sentry_base_url || "https://sentry.io",
      });

      const issues = await sentry.listUnresolvedIssues(
        conn.sentry_project_slug,
      );

      for (const issue of issues) {
        // Dedupe against existing tasks for this Forge project + issue id.
        const { data: existing } = await service
          .from("tasks")
          .select("id")
          .eq("project_id", conn.forge_project_id)
          .eq("sentry_issue_id", issue.id)
          .limit(1);

        if (existing && existing.length > 0) {
          skipped += 1;
          continue;
        }

        await adapter.createTask({
          name: issue.title,
          description: `${issue.culprit || ""}\n${issue.permalink}`,
          projectId: conn.forge_project_id,
          priority: 2,
          sentryIssueId: issue.id,
          sentryOrgSlug: conn.sentry_org_slug,
          createdBy: userId,
        });
        created += 1;
      }

      await service
        .from("sentry_connections")
        .update({ last_sync_at: new Date().toISOString() })
        .eq("id", conn.id);
    }

    return NextResponse.json({ created, skipped });
  } catch (error) {
    console.error("Sentry sync error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Sync failed", details: message },
      { status: 500 },
    );
  }
}
