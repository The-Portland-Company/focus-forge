import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const OWNER_KEYS = [
  ["organizationId", "organization_id"],
  ["projectId", "project_id"],
  ["goalId", "goal_id"],
  ["sectionId", "section_id"],
] as const;

function toPlanResponse(row: any) {
  return {
    id: row.id,
    organizationId: row.organization_id || undefined,
    projectId: row.project_id || undefined,
    goalId: row.goal_id || undefined,
    sectionId: row.section_id || undefined,
    name: row.name,
    contentMarkdown: row.content_markdown ?? "",
    order: row.order_index ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/plans?ownerType=project&ownerId=<id> — list live plans for one owner.
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const ownerType = searchParams.get("ownerType");
    const ownerId = searchParams.get("ownerId");

    const match = OWNER_KEYS.find(([camel]) => camel.replace("Id", "") === ownerType);
    if (!match || !ownerId) {
      return NextResponse.json(
        { error: "ownerType (organization|project|goal|section) and ownerId are required" },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("plans")
      .select("*")
      .eq(match[1], ownerId)
      .is("deleted_at", null)
      .order("order_index", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json((data || []).map(toPlanResponse));
  } catch (error) {
    console.error("Failed to list plans:", error);
    return NextResponse.json({ error: "Failed to list plans" }, { status: 500 });
  }
}

// POST /api/plans — create a plan owned by exactly one entity.
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
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    // Collect the owner ids present in the body; exactly one must be set.
    const owners = OWNER_KEYS.map(([camel, col]) => ({
      col,
      value:
        typeof body?.[camel] === "string" && body[camel].trim()
          ? body[camel].trim()
          : null,
    })).filter((o) => o.value);

    if (owners.length !== 1) {
      return NextResponse.json(
        { error: "Exactly one of organizationId, projectId, goalId, sectionId is required" },
        { status: 400 },
      );
    }

    const order =
      body?.order !== undefined && Number.isFinite(Number(body.order))
        ? Number(body.order)
        : 0;
    const contentMarkdown =
      typeof body?.contentMarkdown === "string" ? body.contentMarkdown : "";

    const insertPayload: any = {
      name,
      content_markdown: contentMarkdown,
      order_index: order,
      [owners[0].col]: owners[0].value,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("plans")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error || !data) {
      // RLS denial or a bad owner id surfaces here.
      return NextResponse.json(
        { error: error?.message || "Failed to create plan" },
        { status: 500 },
      );
    }

    return NextResponse.json(toPlanResponse(data), { status: 201 });
  } catch (error) {
    console.error("Failed to create plan:", error);
    return NextResponse.json({ error: "Failed to create plan" }, { status: 500 });
  }
}
