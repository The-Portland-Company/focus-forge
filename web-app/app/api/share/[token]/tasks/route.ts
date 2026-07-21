import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { authorizeShareWrite } from "@/lib/share-write-guard";

export const dynamic = "force-dynamic";

// POST: add a task from a read-write share link. Public — see share-write-guard.
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await props.params;
    const grant = await authorizeShareWrite(token);
    if (!grant.ok) {
      return NextResponse.json({ error: grant.error }, { status: grant.status });
    }

    const body = await request.json().catch(() => ({}));
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    if (name.length > 500) {
      return NextResponse.json({ error: "name is too long" }, { status: 400 });
    }

    const admin = getAdminClient();

    // A section may be supplied, but only one that belongs to this project —
    // otherwise the link could attach tasks to an unrelated project's section.
    let sectionId: string | null = null;
    if (typeof body?.section_id === "string" && body.section_id.trim()) {
      const { data: section } = await admin
        .from("sections")
        .select("id")
        .eq("id", body.section_id.trim())
        .eq("project_id", grant.projectId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!section) {
        return NextResponse.json(
          { error: "Unknown section" },
          { status: 400 },
        );
      }
      sectionId = section.id;
    }

    const now = new Date().toISOString();
    const { data, error } = await admin
      .from("tasks")
      .insert({
        name,
        // Always the share's own project — never a client-supplied id.
        project_id: grant.projectId,
        section_id: sectionId,
        completed: false,
        priority: 4,
        created_at: now,
        updated_at: now,
      })
      .select("id,name,completed,section_id")
      .single();

    if (error || !data) {
      console.error("Share task create failed:", error);
      return NextResponse.json(
        { error: "Failed to create task" },
        { status: 500 },
      );
    }

    return NextResponse.json({ task: data });
  } catch (error) {
    console.error("Share task create threw:", error);
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 },
    );
  }
}
