import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function toSectionResponse(row: any) {
  return {
    id: row.id,
    name: row.name,
    projectId: row.project_id,
    parentId: row.parent_id,
    color: row.color,
    description: row.description,
    icon: row.icon,
    order: row.order_index ?? row.todoist_order ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    todoistId: row.todoist_id,
    todoistOrder: row.todoist_order,
    todoistCollapsed: row.todoist_collapsed,
  };
}

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

    const projectId = request.nextUrl.searchParams.get("projectId");

    let query = supabase
      .from("sections")
      .select("*")
      .order("todoist_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (projectId) {
      query = query.eq("project_id", projectId);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json((data || []).map(toSectionResponse));
  } catch (error) {
    console.error("Failed to get sections:", error);
    return NextResponse.json({ error: "Failed to get sections" }, { status: 500 });
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
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const projectId = typeof body?.projectId === "string" ? body.projectId : "";

    if (!name || !projectId) {
      return NextResponse.json(
        { error: "name and projectId are required" },
        { status: 400 },
      );
    }

    const order =
      body?.order !== undefined && Number.isFinite(Number(body.order))
        ? Number(body.order)
        : 0;
    const parentId =
      typeof body?.parentId === "string" && body.parentId.trim()
        ? body.parentId.trim()
        : null;

    const insertPayload: any = {
      name,
      project_id: projectId,
      todoist_order: order,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (parentId) {
      insertPayload.parent_id = parentId;
    }

    const { data, error } = await supabase
      .from("sections")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Failed to create section" },
        { status: 500 },
      );
    }

    return NextResponse.json(toSectionResponse(data), { status: 201 });
  } catch (error) {
    console.error("Failed to create section:", error);
    return NextResponse.json({ error: "Failed to create section" }, { status: 500 });
  }
}
