#!/usr/bin/env node
/**
 * One-time backfill: clean up orphaned AI/rule-generated tasks that were left
 * behind by deleted email threads.
 *
 * Background: before the applyThreadAction fix, deleting an email thread only
 * soft-deleted the thread (status = "deleted") and never touched the tasks it
 * had auto-generated. Those AI/rule tasks live on forever in Today/projects as
 * noise. This script finds tasks linked (email_thread_tasks) to threads whose
 * status = "deleted" where generated_by IN ('ai','rule') and SOFT-deletes them
 * via the same recoverable path (soft_delete_entity RPC -> recoverable in /trash).
 *
 * User-converted tasks (generated_by = "user") are NEVER touched.
 * Nothing is hard-deleted.
 *
 * Auth: reads SUPABASE creds from the repo-root .env (focus-forge-web/.env),
 * which holds NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Falls back
 * to .env.local and process.env.
 *
 * Usage (run from the web-app directory):
 *   Dry run (default, reports counts, changes nothing):
 *     node scripts/cleanup-orphaned-email-tasks.mjs
 *   Apply (actually soft-deletes the orphaned tasks):
 *     node scripts/cleanup-orphaned-email-tasks.mjs --apply
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Load repo-root .env (../.env from scripts/), then .env.local, then default.
config({ path: resolve(__dirname, "../../.env") });
config({ path: resolve(__dirname, "../.env.local") });
config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
      "Ensure focus-forge-web/.env is populated.",
  );
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log(
    `\n🧹 Orphaned email-task cleanup — mode: ${APPLY ? "APPLY (soft-delete)" : "DRY RUN (no changes)"}\n`,
  );

  // 1. Find deleted threads.
  const { data: deletedThreads, error: threadErr } = await supabase
    .from("email_threads")
    .select("id")
    .eq("status", "deleted");
  if (threadErr) throw threadErr;

  const deletedThreadIds = (deletedThreads || []).map((t) => t.id);
  console.log(`Deleted threads found: ${deletedThreadIds.length}`);
  if (deletedThreadIds.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  // 2. Find email_thread_tasks links for those threads. Chunk the IN() to keep
  //    the query size reasonable.
  const CHUNK = 200;
  const links = [];
  for (let i = 0; i < deletedThreadIds.length; i += CHUNK) {
    const chunk = deletedThreadIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("email_thread_tasks")
      .select("task_id,generated_by,thread_id")
      .in("thread_id", chunk);
    if (error) throw error;
    if (data) links.push(...data);
  }

  // 3. Cohort report.
  const cohorts = { ai: [], rule: [], user: [], other: [] };
  for (const link of links) {
    if (!link.task_id) continue;
    const gb = link.generated_by;
    if (gb === "ai") cohorts.ai.push(link.task_id);
    else if (gb === "rule") cohorts.rule.push(link.task_id);
    else if (gb === "user") cohorts.user.push(link.task_id);
    else cohorts.other.push(link.task_id);
  }

  console.log(`\nLinked tasks on deleted threads by cohort:`);
  console.log(`  ai   : ${cohorts.ai.length} (will be soft-deleted)`);
  console.log(`  rule : ${cohorts.rule.length} (will be soft-deleted)`);
  console.log(`  user : ${cohorts.user.length} (PRESERVED)`);
  console.log(`  other: ${cohorts.other.length} (PRESERVED)`);

  // Only ai + rule are eligible, and only tasks that are not already deleted.
  const eligibleIds = [...new Set([...cohorts.ai, ...cohorts.rule])];
  if (eligibleIds.length === 0) {
    console.log("\nNo AI/rule tasks to clean up.");
    return;
  }

  // Filter to tasks that still exist and are not already soft-deleted.
  const liveIds = [];
  for (let i = 0; i < eligibleIds.length; i += CHUNK) {
    const chunk = eligibleIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("tasks")
      .select("id,deleted_at")
      .in("id", chunk);
    if (error) throw error;
    for (const row of data || []) {
      if (!row.deleted_at) liveIds.push(row.id);
    }
  }

  console.log(
    `\nEligible AI/rule tasks still live (not already deleted): ${liveIds.length}`,
  );

  if (!APPLY) {
    console.log(
      `\nDRY RUN complete. Re-run with --apply to soft-delete ${liveIds.length} task(s).`,
    );
    return;
  }

  // 4. Apply — soft-delete each via the recoverable RPC.
  let ok = 0;
  let failed = 0;
  for (const id of liveIds) {
    const { error } = await supabase.rpc("soft_delete_entity", {
      p_entity_type: "task",
      p_entity_id: id,
    });
    if (error) {
      failed++;
      console.error(`  Failed to soft-delete task ${id}:`, error.message);
    } else {
      ok++;
    }
  }

  console.log(
    `\n✅ APPLY complete. Soft-deleted: ${ok}, failed: ${failed}. ` +
      `Recoverable via /trash.`,
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
