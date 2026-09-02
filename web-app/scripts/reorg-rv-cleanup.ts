/**
 * One-off RV cleanup: ~89 infra/notification emails were auto-filed into the
 * 2-char "RV" project (Property org) by the old substring guessProjectId. This
 * classifies each OPEN RV task with the AI waterfall and moves the mis-filed
 * ones into better-fit projects, recording a restorable task_reorg batch.
 *
 * Genuine RV work (roof, weatherizing, construction, repairs) is left in place
 * because the model returns suggestedProjectId=null for it.
 *
 * Run: tsx scripts/reorg-rv-cleanup.ts            (dry-run, prints proposal)
 *      tsx scripts/reorg-rv-cleanup.ts --apply    (records batch + moves)
 */
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { resolveEmailChain } from "../lib/ai/email-provider";
import { classifyTasksForReorg } from "../lib/task-reorg/classify";
import { applyReorgBatch, type ReorgMove } from "../lib/task-reorg/apply";

loadEnv({ path: "../.env" });

const RV_PROJECT_ID = "7b0c411a-15b5-4291-80b5-c27793dd92bc";
const PROPERTY_ORG_ID = "9ec51511-f279-41de-a77e-bb976fe9cc33";
const SPENCER_USER_ID = "f7c172d9-f2de-43a0-a984-8f6b7b17c70d";

async function main() {
  const apply = process.argv.includes("--apply");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  }
  const db = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });

  // Chain from the Property org's ai_settings (falls back to the default chain).
  const { data: orgRow } = await db
    .from("organizations")
    .select("ai_settings")
    .eq("id", PROPERTY_ORG_ID)
    .maybeSingle();
  const chain = resolveEmailChain((orgRow as any)?.ai_settings ?? null);
  if (chain.length === 0) {
    throw new Error("Property org has AI triage disabled — cannot classify");
  }

  // Open, non-deleted RV tasks.
  const { data: taskRows, error: taskError } = await db
    .from("tasks")
    .select("id,name,description,section_id")
    .eq("project_id", RV_PROJECT_ID)
    .eq("completed", false)
    .is("deleted_at", null);
  if (taskError) throw new Error(`Load tasks failed: ${taskError.message}`);
  const tasks = (taskRows || []) as Array<{
    id: string;
    name: string;
    description: string | null;
    section_id: string | null;
  }>;
  console.log(`Open RV tasks: ${tasks.length}`);

  // Candidate projects: every non-deleted project in Spencer's orgs, minus RV.
  const { data: orgIdRows } = await db
    .from("user_organizations")
    .select("organization_id")
    .eq("user_id", SPENCER_USER_ID);
  const orgIds = ((orgIdRows || []) as Array<{ organization_id: string }>).map(
    (r) => r.organization_id,
  );
  const { data: projRows } = await db
    .from("projects")
    .select("id,name,description,organization_id,organizations(name)")
    .in("organization_id", orgIds)
    .is("deleted_at", null);
  const candidateProjects = ((projRows || []) as Array<any>)
    .filter((p) => p.id !== RV_PROJECT_ID)
    .map((p) => ({
      id: p.id as string,
      name: p.name as string,
      description: p.description as string | null,
      organizationName: p.organizations?.name ?? null,
    }));
  console.log(`Candidate projects: ${candidateProjects.length}`);

  const proposal = await classifyTasksForReorg({
    tasks: tasks.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
    })),
    candidateProjects,
    currentProjectId: RV_PROJECT_ID,
    currentProjectName: "RV",
    chain,
  });

  const nameById = new Map(candidateProjects.map((p) => [p.id, p.name]));
  const moving = proposal.filter((p) => p.suggestedProjectId);
  const staying = proposal.filter((p) => !p.suggestedProjectId);

  // Group destinations for the report.
  const byDest = new Map<string, number>();
  for (const m of moving) {
    const key = m.suggestedProjectId as string;
    byDest.set(key, (byDest.get(key) || 0) + 1);
  }
  console.log(`\nProposed moves: ${moving.length} | staying in RV: ${staying.length}`);
  console.log("Destinations:");
  for (const [pid, count] of [...byDest.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count.toString().padStart(3)}  ${nameById.get(pid)}`);
  }
  console.log("\nStaying in RV (genuine RV work):");
  for (const s of staying) console.log(`  - ${s.name}`);

  if (!apply) {
    console.log("\nDry-run only. Re-run with --apply to record the batch and move tasks.");
    return;
  }

  const sectionByTask = new Map(tasks.map((t) => [t.id, t.section_id]));
  const moves: ReorgMove[] = moving.map((p) => ({
    taskId: p.taskId,
    beforeProjectId: RV_PROJECT_ID,
    beforeSectionId: sectionByTask.get(p.taskId) ?? null,
    afterProjectId: p.suggestedProjectId as string,
    afterSectionId: null,
    reason: p.reason,
    confidence: p.confidence,
  }));

  const { batchId, movedCount } = await applyReorgBatch(db, {
    organizationId: PROPERTY_ORG_ID,
    projectId: RV_PROJECT_ID,
    createdBy: SPENCER_USER_ID,
    summary: {
      sourceProjectName: "RV",
      movedCount: moves.length,
      destinations: [...byDest.entries()].map(([project_id, count]) => ({
        project_id,
        projectName: nameById.get(project_id),
        count,
      })),
    },
    moves,
  });

  console.log(`\nApplied. batchId=${batchId} movedCount=${movedCount}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
