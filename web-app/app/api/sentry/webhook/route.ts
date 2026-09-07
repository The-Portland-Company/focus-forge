import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { SupabaseAdapter } from "@/lib/db/supabase-adapter";
import { SentryClient } from "@/lib/services/sentry-client";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Public endpoint: Sentry issue webhooks. No user session — authenticity is
// established by verifying the `sentry-hook-signature` HMAC against the
// matching connection owner's stored webhook secret.
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("sentry-hook-signature") || "";

    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 401 });
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const issue = payload?.data?.issue || payload?.data?.event;
    if (!issue) {
      // Nothing actionable — acknowledge so Sentry doesn't retry.
      return NextResponse.json({ received: true });
    }

    const projectSlug: string | undefined = issue?.project?.slug;
    const orgSlug: string | undefined =
      issue?.project?.organization?.slug ||
      payload?.data?.issue?.organization?.slug;

    const service = createServiceClient(supabaseUrl, supabaseServiceKey);

    // Find candidate connections matching the incoming project (and org, when
    // present). The correct owner is the one whose secret verifies the body.
    let query = service.from("sentry_connections").select("*");
    if (projectSlug) query = query.eq("sentry_project_slug", projectSlug);
    if (orgSlug) query = query.eq("sentry_org_slug", orgSlug);

    const { data: candidates } = await query;

    if (!candidates || candidates.length === 0) {
      return NextResponse.json({ received: true });
    }

    // Resolve owner + verify signature against that owner's webhook secret.
    let matched: { conn: any; userId: string } | null = null;
    for (const conn of candidates) {
      const { data: profile } = await service
        .from("profiles")
        .select("sentry_webhook_secret")
        .eq("id", conn.user_id)
        .single();

      const secret = profile?.sentry_webhook_secret;
      if (!secret) continue;

      if (SentryClient.verifyWebhookSignature(rawBody, signature, secret)) {
        matched = { conn, userId: conn.user_id };
        break;
      }
    }

    if (!matched) {
      return NextResponse.json(
        { error: "Signature verification failed" },
        { status: 401 },
      );
    }

    const { conn, userId } = matched;
    const issueId: string | undefined = issue?.id;

    if (!issueId) {
      return NextResponse.json({ received: true });
    }

    // Dedupe against existing tasks for this Forge project + issue id.
    const { data: existing } = await service
      .from("tasks")
      .select("id")
      .eq("project_id", conn.forge_project_id)
      .eq("sentry_issue_id", issueId)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ received: true, deduped: true });
    }

    const adapter = new SupabaseAdapter(service, userId);
    await adapter.createTask({
      name: issue?.title || `Sentry issue ${issueId}`,
      description: `${issue?.culprit || ""}\n${issue?.permalink || ""}`,
      projectId: conn.forge_project_id,
      priority: 2,
      sentryIssueId: issueId,
      sentryOrgSlug: conn.sentry_org_slug,
      createdBy: userId,
    });

    return NextResponse.json({ received: true, created: true });
  } catch (error) {
    console.error("Sentry webhook error:", error);
    // Acknowledge to avoid retry storms; the error is logged server-side.
    return NextResponse.json({ received: true });
  }
}
