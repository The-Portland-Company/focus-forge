import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error || !session?.user) {
    return null;
  }
  return session.user;
}

// List the caller's Sentry -> Forge project mappings.
export async function GET() {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const service = createServiceClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await service
      .from("sentry_connections")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Failed to list Sentry mappings:", error);
      return NextResponse.json(
        { error: "Failed to list mappings" },
        { status: 500 },
      );
    }

    return NextResponse.json({ mappings: data ?? [] });
  } catch (error) {
    console.error("Sentry mappings GET error:", error);
    return NextResponse.json(
      { error: "Failed to list mappings" },
      { status: 500 },
    );
  }
}

// Upsert a mapping for the caller.
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sentryProjectSlug, sentryOrgSlug, forgeProjectId } =
      await request.json();

    if (!sentryProjectSlug || !sentryOrgSlug || !forgeProjectId) {
      return NextResponse.json(
        {
          error:
            "sentryProjectSlug, sentryOrgSlug, and forgeProjectId are required",
        },
        { status: 400 },
      );
    }

    const service = createServiceClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await service
      .from("sentry_connections")
      .upsert(
        {
          user_id: user.id,
          sentry_project_slug: sentryProjectSlug,
          sentry_org_slug: sentryOrgSlug,
          forge_project_id: forgeProjectId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,sentry_org_slug,sentry_project_slug" },
      )
      .select()
      .single();

    if (error) {
      console.error("Failed to upsert Sentry mapping:", error);
      return NextResponse.json(
        { error: "Failed to save mapping" },
        { status: 500 },
      );
    }

    return NextResponse.json({ mapping: data });
  } catch (error) {
    console.error("Sentry mappings POST error:", error);
    return NextResponse.json(
      { error: "Failed to save mapping" },
      { status: 500 },
    );
  }
}

// Delete a mapping owned by the caller.
export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { error: "id query parameter is required" },
        { status: 400 },
      );
    }

    const service = createServiceClient(supabaseUrl, supabaseServiceKey);
    const { error } = await service
      .from("sentry_connections")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      console.error("Failed to delete Sentry mapping:", error);
      return NextResponse.json(
        { error: "Failed to delete mapping" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Sentry mappings DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete mapping" },
      { status: 500 },
    );
  }
}
