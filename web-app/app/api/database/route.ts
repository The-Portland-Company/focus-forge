import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SupabaseAdapter } from "@/lib/db/supabase-adapter";
import { loadDatabaseForUser } from "@/lib/db/load-database";

export async function GET(request: NextRequest) {
  try {
    const includeEmailData =
      request.nextUrl.searchParams.get("includeEmailData") !== "false";
    const includeInboxItems =
      includeEmailData &&
      request.nextUrl.searchParams.get("includeInboxItems") !== "false";

    // Check authentication first
    const authClient = await createClient();
    const {
      data: { session },
      error: authError,
    } = await authClient.auth.getSession();

    if (authError || !session?.user) {
      console.error("❌ Auth error in database route:", authError);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await loadDatabaseForUser(
      session.user.id,
      session.user.email,
      { includeEmailData, includeInboxItems },
    );

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Database API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const adapter = new SupabaseAdapter(supabase, session.user.id);

    // Handle different types of data updates
    if (body.organizations) {
      // Update organizations
      // Implementation would go here
    }

    if (body.projects) {
      // Update projects
      // Implementation would go here
    }

    if (body.tasks) {
      // Update tasks
      // Implementation would go here
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Database POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
