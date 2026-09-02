// Shared batch-apply / rollback logic for task reorganization. Works with any
// supabase-js client (the cookie-session client in a route, or a service-role
// client in a one-off script). The new task_reorg_* tables are not yet in the
// generated types, so the client is treated as `any` (repo convention until
// types are regenerated).

export type ReorgMove = {
  taskId: string;
  beforeProjectId: string | null;
  beforeSectionId: string | null;
  afterProjectId: string;
  afterSectionId?: string | null;
  reason?: string;
  confidence?: number;
};

export type ApplyReorgResult = {
  batchId: string;
  movedCount: number;
};

/**
 * Record a reorg batch + its moves, then move each task to its target project.
 * A cross-project move clears section_id (sections are project-scoped) unless an
 * explicit afterSectionId is provided. Everything is restorable via the batch.
 */
export async function applyReorgBatch(
  client: any,
  input: {
    organizationId: string;
    projectId: string;
    createdBy: string | null;
    summary?: Record<string, unknown> | null;
    moves: ReorgMove[];
  },
): Promise<ApplyReorgResult> {
  const { data: batch, error: batchError } = await client
    .from("task_reorg_batches")
    .insert({
      organization_id: input.organizationId,
      project_id: input.projectId,
      created_by: input.createdBy,
      summary: input.summary ?? null,
      status: "applied",
    })
    .select("id")
    .single();

  if (batchError || !batch?.id) {
    throw new Error(
      `Failed to create reorg batch: ${batchError?.message || "no id returned"}`,
    );
  }

  const batchId = batch.id as string;
  let movedCount = 0;

  for (const move of input.moves) {
    const afterSectionId =
      move.afterSectionId === undefined ? null : move.afterSectionId;

    const { error: moveInsertError } = await client
      .from("task_reorg_moves")
      .insert({
        batch_id: batchId,
        task_id: move.taskId,
        before_project_id: move.beforeProjectId,
        before_section_id: move.beforeSectionId,
        after_project_id: move.afterProjectId,
        after_section_id: afterSectionId,
        reason: move.reason ?? null,
        confidence: move.confidence ?? null,
      });

    if (moveInsertError) {
      throw new Error(
        `Failed to record move for task ${move.taskId}: ${moveInsertError.message}`,
      );
    }

    const { error: taskUpdateError } = await client
      .from("tasks")
      .update({
        project_id: move.afterProjectId,
        section_id: afterSectionId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", move.taskId);

    if (taskUpdateError) {
      throw new Error(
        `Failed to move task ${move.taskId}: ${taskUpdateError.message}`,
      );
    }

    movedCount += 1;
  }

  return { batchId, movedCount };
}

export type RollbackReorgResult = {
  restoredCount: number;
  skipped: string[];
};

/**
 * Restore a subset of a batch's moves: put each named task back to its
 * before_project_id / before_section_id and mark the move restored. Moves that
 * are already restored, or whose id is not in this batch, are skipped.
 */
export async function rollbackReorgMoves(
  client: any,
  moveIds: string[],
): Promise<RollbackReorgResult> {
  const uniqueIds = Array.from(new Set(moveIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return { restoredCount: 0, skipped: [] };
  }

  const { data: moves, error: loadError } = await client
    .from("task_reorg_moves")
    .select(
      "id,task_id,before_project_id,before_section_id,restored",
    )
    .in("id", uniqueIds);

  if (loadError) {
    throw new Error(`Failed to load reorg moves: ${loadError.message}`);
  }

  const rows = (moves || []) as Array<{
    id: string;
    task_id: string;
    before_project_id: string | null;
    before_section_id: string | null;
    restored: boolean | null;
  }>;

  const skipped: string[] = [];
  let restoredCount = 0;
  const now = new Date().toISOString();

  for (const row of rows) {
    if (row.restored) {
      skipped.push(row.id);
      continue;
    }

    const { error: taskError } = await client
      .from("tasks")
      .update({
        project_id: row.before_project_id,
        section_id: row.before_section_id,
        updated_at: now,
      })
      .eq("id", row.task_id);

    if (taskError) {
      throw new Error(
        `Failed to restore task ${row.task_id}: ${taskError.message}`,
      );
    }

    const { error: markError } = await client
      .from("task_reorg_moves")
      .update({ restored: true, restored_at: now })
      .eq("id", row.id);

    if (markError) {
      throw new Error(
        `Failed to mark move ${row.id} restored: ${markError.message}`,
      );
    }

    restoredCount += 1;
  }

  // Any requested id we never loaded (wrong batch / deleted) is also "skipped".
  const loadedIds = new Set(rows.map((r) => r.id));
  for (const id of uniqueIds) {
    if (!loadedIds.has(id)) skipped.push(id);
  }

  return { restoredCount, skipped };
}
