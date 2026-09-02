/**
 * Misc cleanup of misfiled notifications in physical/construction projects that
 * the old substring guessProjectId polluted (e.g. "warehouse" matched project
 * "House"). Classified by Claude Code session (paid AI chain out of credit).
 * Each source project is recorded as its own restorable task_reorg batch.
 * Property is intentionally left untouched (its 2 invoice tasks are plausibly
 * legitimate property finance and were not substring matches).
 *
 * Run: tsx scripts/reorg-misc-apply.ts            (dry-run)
 *      tsx scripts/reorg-misc-apply.ts --apply
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { applyReorgBatch, type ReorgMove } from "../lib/task-reorg/apply";

loadEnv({ path: "../.env" });

const TPC_ORG_ID = "182e953a-7fa1-4b75-b070-30edd3776154";
const SPENCER_USER_ID = "f7c172d9-f2de-43a0-a984-8f6b7b17c70d";
const ADMIN = "27d710f2-52ee-4b2f-a821-92b8625bbcd1"; // TPC / Administrative

type Group = {
  label: string;
  projectId: string;
  orgId: string;
  map: Record<string, [string, string]>; // id-prefix -> [destProjectId, reason]
};

const GROUPS: Group[] = [
  {
    label: "House",
    projectId: "3dd0d0be-1125-4bea-ac0c-9bc0e22a241d",
    orgId: TPC_ORG_ID,
    map: {
      ba37f87f: [ADMIN, "Office/warehouse space inquiry (matched 'house')"],
      "3f4c1292": [ADMIN, "Print vendor quote email"],
      b699f5c1: [ADMIN, "Bend OR event invitation"],
      cc901b2d: [ADMIN, "Q3 question email thread"],
      b2e04c0a: [ADMIN, "Google Workspace payment-failure notice"],
      "5e50e4ad": [ADMIN, "Revixly sales introduction"],
    },
  },
  {
    label: "Tiny House",
    projectId: "0bf2def2-bda5-4022-ac40-c77da5268523",
    orgId: TPC_ORG_ID,
    map: {
      "61d9a1aa": [ADMIN, "Supabase infra: unpause 'Tiny Homes' project"],
    },
  },
];

async function main() {
  const apply = process.argv.includes("--apply");
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  for (const g of GROUPS) {
    const { data: taskRows, error } = await db
      .from("tasks")
      .select("id,name,section_id")
      .eq("project_id", g.projectId)
      .eq("completed", false)
      .is("deleted_at", null);
    if (error) throw error;

    const moves: ReorgMove[] = [];
    for (const t of taskRows || []) {
      const entry = g.map[(t.id as string).slice(0, 8)];
      if (!entry) continue;
      moves.push({
        taskId: t.id as string,
        beforeProjectId: g.projectId,
        beforeSectionId: (t.section_id as string) ?? null,
        afterProjectId: entry[0],
        afterSectionId: null,
        reason: entry[1],
        confidence: 0.85,
      });
    }

    console.log(`[${g.label}] matched ${moves.length}/${Object.keys(g.map).length}`);
    if (!apply) continue;

    const { batchId, movedCount } = await applyReorgBatch(db, {
      organizationId: g.orgId,
      projectId: g.projectId,
      createdBy: SPENCER_USER_ID,
      summary: {
        sourceProjectName: g.label,
        note: "Classified by Claude Code session; misfiled notifications only",
        movedCount: moves.length,
      },
      moves,
    });
    console.log(`  applied batchId=${batchId} moved=${movedCount}`);
  }

  if (!apply) console.log("\nDry-run. Re-run with --apply.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
