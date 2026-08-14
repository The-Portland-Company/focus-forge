import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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
  const supabase = await createClient();
  const {
    data: { session },
    error: authError,
  } = await supabase.auth.getSession();

  if (authError || !session?.user) {
    return {
      errorResponse: NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      ),
    };
  }

  const authz = await requireOrgAdmin(supabase, session.user.id, organizationId);
  if (!authz.authorized) {
    return {
      errorResponse: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { userId: session.user.id };
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
    // Accept either the full document ({ email: {...} }) or a bare email slice.
    const incoming =
      body && typeof body === "object" && "email" in body ? body : { email: body };
    // normalizeOrgAISettings drops unknown model ids, de-dupes, appends any
    // missing default, and coerces `enabled` to a boolean.
    const settings: OrgAISettings = normalizeOrgAISettings(incoming);

    const admin = getAdminClient();
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
