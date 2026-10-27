import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/tpc-session";
import { resolveLocalUser, scopedSupabaseClient } from "@/lib/auth/local-identity";
import { requireOrgAdmin } from "@/lib/api/authz";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  normalizeOrgAISettings,
  type OrgAISettings,
} from "@/lib/ai/email-provider";
import { modelsForSurface } from "@/lib/ai/model-chains";
import { hasProviderKey } from "@/lib/ai/structured-waterfall";

/**
 * Per-organization AI settings (organizations.ai_settings JSONB). Today this is
 * the email/spam triage provider waterfall. Reads and writes both require the
 * caller to be an admin/owner of the org; the admin client is only used AFTER
 * that check, mirroring the sibling organization routes.
 */

type Ctx = { params: Promise<{ id: string }> };

/** Which providers actually have an API key on this deployment. */
function providerStatus() {
  return modelsForSurface("email").map((model) => ({
    id: model.id,
    label: model.label,
    provider: model.provider,
    configured: hasProviderKey(model.provider),
  }));
}

async function authorize(
  organizationId: string,
): Promise<{ errorResponse?: NextResponse; userId?: string }> {
  const viewer = await getViewer();
  const localUser = viewer ? await resolveLocalUser(viewer) : null;

  if (!localUser) {
    return {
      errorResponse: NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      ),
    };
  }

  const supabase = scopedSupabaseClient(localUser.id);
  const authz = await requireOrgAdmin(supabase, localUser.id, organizationId);
  if (!authz.authorized) {
    return {
      errorResponse: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { userId: localUser.id };
}

export async function GET(_request: Request, props: Ctx) {
  try {
    const { id } = await props.params;
    const auth = await authorize(id);
    if (auth.errorResponse) return auth.errorResponse;

    const admin = getAdminClient();
    const { data, error } = await admin
      .from("organizations")
      .select("ai_settings")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      settings: normalizeOrgAISettings(
        (data as { ai_settings?: unknown }).ai_settings,
      ),
      providers: providerStatus(),
    });
  } catch (error) {
    console.error("Error loading organization AI settings:", error);
    return NextResponse.json(
      { error: "Failed to load AI settings" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request, props: Ctx) {
  try {
    const { id } = await props.params;
    const auth = await authorize(id);
    if (auth.errorResponse) return auth.errorResponse;

    const body = await request.json().catch(() => ({}));
    const admin = getAdminClient();

    // Merge onto the existing document so a partial save (e.g. only the email
    // chain, or only the rules toggle) never clobbers the other slice — in
    // particular the one-time autoActivateNotified flag set server-side.
    const { data: current } = await admin
      .from("organizations")
      .select("ai_settings")
      .eq("id", id)
      .maybeSingle();
    const existing = normalizeOrgAISettings(
      (current as { ai_settings?: unknown } | null)?.ai_settings,
    );

    // Accept the full document, a bare email slice, or a { rules } slice.
    const hasEmail = body && typeof body === "object" && "email" in body;
    const hasRules = body && typeof body === "object" && "rules" in body;
    const incoming =
      hasEmail || hasRules
        ? {
            email: hasEmail ? (body as any).email : existing.email,
            rules: hasRules
              ? { ...existing.rules, ...(body as any).rules }
              : existing.rules,
          }
        : { email: body, rules: existing.rules };
    // normalizeOrgAISettings drops unknown model ids, de-dupes, appends any
    // missing default, and coerces `enabled`/`autoActivate` to booleans.
    const settings: OrgAISettings = normalizeOrgAISettings(incoming);

    const { data, error } = await admin
      .from("organizations")
      .update({ ai_settings: settings })
      .eq("id", id)
      .select("ai_settings")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      settings: normalizeOrgAISettings(
        (data as { ai_settings?: unknown }).ai_settings,
      ),
      providers: providerStatus(),
    });
  } catch (error) {
    console.error("Error saving organization AI settings:", error);
    return NextResponse.json(
      { error: "Failed to save AI settings" },
      { status: 500 },
    );
  }
}
