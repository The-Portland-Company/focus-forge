import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireOrgAdmin } from "@/lib/api/authz";
import { getAdminClient } from "@/lib/supabase/admin";
import { buildStoredDoc, toStatus } from "@/lib/media-storage/config";

/**
 * Per-organization media storage account (organizations.media_storage JSONB).
 *
 * Proof capture uploads media through the org's own Snap Shoot Share account.
 * Reads and writes both require the caller to be an admin/owner of the org; the
 * admin client is only used AFTER that check, mirroring the sibling
 * organizations/[id]/ai-settings route. GET never returns the token — only a
 * status view (whether an account is configured, its endpoint and label).
 */

type Ctx = { params: Promise<{ id: string }> };

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
      .select("media_storage")
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
      settings: toStatus((data as { media_storage?: unknown }).media_storage),
    });
  } catch (error) {
    console.error("Error loading organization media storage:", error);
    return NextResponse.json(
      { error: "Failed to load media storage" },
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
    const { data: existing, error: readError } = await admin
      .from("organizations")
      .select("media_storage")
      .eq("id", id)
      .maybeSingle();
    if (readError) throw readError;
    if (!existing) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    const doc = buildStoredDoc(
      body,
      (existing as { media_storage?: unknown }).media_storage,
    );

    const { data, error } = await admin
      .from("organizations")
      .update({ media_storage: doc })
      .eq("id", id)
      .select("media_storage")
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({
      settings: toStatus((data as { media_storage?: unknown }).media_storage),
    });
  } catch (error) {
    console.error("Error saving organization media storage:", error);
    return NextResponse.json(
      { error: "Failed to save media storage" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, props: Ctx) {
  try {
    const { id } = await props.params;
    const auth = await authorize(id);
    if (auth.errorResponse) return auth.errorResponse;

    const admin = getAdminClient();
    const { data, error } = await admin
      .from("organizations")
      .update({ media_storage: {} })
      .eq("id", id)
      .select("media_storage")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      settings: toStatus((data as { media_storage?: unknown }).media_storage),
    });
  } catch (error) {
    console.error("Error clearing organization media storage:", error);
    return NextResponse.json(
      { error: "Failed to clear media storage" },
      { status: 500 },
    );
  }
}
