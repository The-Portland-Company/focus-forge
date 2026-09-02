import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireProjectAdmin } from "@/lib/api/authz";
import { rollbackReorgMoves } from "@/lib/task-reorg/apply";

/**
 * POST /api/reorganize/batches/[batchId]/rollback
 *
 * Body: { moveIds: string[] } — restore a cherry-picked subset of a batch's
 * moves. Each named task is put back to its before_project_id/before_section_id
 * and the move is marked restored. Returns the restored/skipped counts.
 */
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ batchId: string }> },
) {
  try {
    const params = await props.params;
    const batchId = params.batchId;
    const supabase = await createClient();
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError || !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // The batch carries the source project; authorize the caller against it.
    const { data: batch } = (await (supabase as any)
      .from("task_reorg_batches")
      .select("id,project_id,organization_id")
      .eq("id", batchId)
      .maybeSingle()) as {
      data: { id: string; project_id: string | null; organization_id: string } | null;
    };

    if (!batch) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }
    if (!batch.project_id) {
      return NextResponse.json(
        { error: "Batch has no source project to authorize against" },
        { status: 409 },
      );
    }

    const authz = await requireProjectAdmin(
      supabase,
      session.user.id,
      batch.project_id,
    );
    if (!authz.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: { moveIds?: unknown } = {};
    try {
      body = (await request.json()) || {};
    } catch {
      body = {};
    }
    const moveIds = Array.isArray(body.moveIds)
      ? body.moveIds.filter((v): v is string => typeof v === "string")
      : [];

    if (moveIds.length === 0) {
      return NextResponse.json(
        { error: "moveIds must be a non-empty array" },
        { status: 400 },
      );
    }

    // Confine the requested ids to THIS batch (RLS already scopes to the org).
    const { data: ownedRows } = await (supabase as any)
      .from("task_reorg_moves")
      .select("id")
      .eq("batch_id", batchId)
      .in("id", moveIds);
    const ownedIds = ((ownedRows || []) as Array<{ id: string }>).map(
      (r) => r.id,
    );

    const { restoredCount, skipped } = await rollbackReorgMoves(
      supabase,
      ownedIds,
    );

    return NextResponse.json({
      batchId,
      restoredCount,
      skipped,
      requested: moveIds.length,
    });
  } catch (error) {
    console.error("Error rolling back reorg moves:", error);
    return NextResponse.json(
      { error: "Failed to roll back reorg moves" },
      { status: 500 },
    );
  }
}
