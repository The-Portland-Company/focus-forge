import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireProjectAdmin } from "@/lib/api/authz";

/**
 * GET /api/projects/[id]/reorganize/batches
 *
 * Lists this project's past reorg batches with their moves, for the rollback
 * modal. RLS already scopes rows to the caller's orgs; the project filter is
 * an additional narrowing.
 */
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  try {
    const params = await props.params;
    const projectId = params.id;
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authz = await requireProjectAdmin(
      supabase,
      session.user.id,
      projectId,
    );
    if (!authz.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: batchRows, error: batchError } = await (supabase as any)
      .from("task_reorg_batches")
      .select("id,organization_id,project_id,created_by,created_at,summary,status")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (batchError) {
      return NextResponse.json(
        { error: "Failed to load reorg batches" },
        { status: 500 },
      );
    }

    const batches = (batchRows || []) as Array<{ id: string }>;
    const batchIds = batches.map((b) => b.id);

    const { data: moveRows } = batchIds.length
      ? await (supabase as any)
          .from("task_reorg_moves")
          .select(
            "id,batch_id,task_id,before_project_id,before_section_id,after_project_id,after_section_id,reason,confidence,restored,restored_at",
          )
          .in("batch_id", batchIds)
      : { data: [] as any[] };

    const movesByBatch = new Map<string, any[]>();
    for (const move of (moveRows || []) as Array<{ batch_id: string }>) {
      const list = movesByBatch.get(move.batch_id) || [];
      list.push(move);
      movesByBatch.set(move.batch_id, list);
    }

    return NextResponse.json({
      batches: batches.map((b) => ({
        ...b,
        moves: movesByBatch.get(b.id) || [],
      })),
    });
  } catch (error) {
    console.error("Error loading reorg batches:", error);
    return NextResponse.json(
      { error: "Failed to load reorg batches" },
      { status: 500 },
    );
  }
}
