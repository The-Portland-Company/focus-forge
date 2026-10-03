#!/usr/bin/env node
// P4.G3: initial import of the Specs VRM > Mode > Spec > Goal tree into
// Forge, per politogy/docs/sync-contract.md and
// politogy/docs/plans/2026-10-03-specs-forge-sync.md.
//
// Reads directly from the Specs Supabase (pages / spec_goals / spec_tasks)
// and writes into Forge via the connector_upsert_* RPCs (same entry points
// the inbound webhook uses -- see supabase/migrations/20261003220000_specs_forge_connectors.sql),
// so every imported row is locked (for projects) and carries specs_id /
// origin='specs' / sync_hash, same as a normal inbound sync event would.
//
// Usage:
//   node scripts/import-specs-tree.mjs --dry-run   (default; prints the plan, writes nothing)
//   node scripts/import-specs-tree.mjs --apply      (writes to Forge)
//
// Required env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (Forge),
// SPECS_SUPABASE_URL, SPECS_SUPABASE_SERVICE_KEY (Specs), POLITOGY_ORG_ID
// (Forge organizations.id to create the VRM root project under).

import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const APPLY = process.argv.includes("--apply");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v.trim();
}

const forge = createClient(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const specs = createClient(
  requireEnv("SPECS_SUPABASE_URL"),
  requireEnv("SPECS_SUPABASE_SERVICE_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } },
);
const ORG_ID = requireEnv("POLITOGY_ORG_ID");

// Deterministic UUID for the VRM root project -- not a Specs page id (VRM
// has no single Specs page of its own), namespaced off a fixed string so
// re-running this script is idempotent without a lookup table.
const VRM_ROOT_ID = "00000000-0000-4000-8000-000000000001";
const VRM_ROOT_NAME = "Politogy: Voter Relationship Manager";

function hashOf(obj) {
  return "sha256:" + crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

async function fetchAll(client, table, select, { softDeleteColumn = "deleted_at" } = {}) {
  let query = client.from(table).select(select);
  if (softDeleteColumn) query = query.is(softDeleteColumn, null);
  const { data, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ?? [];
}

async function main() {
  console.log(`[import-specs-tree] mode=${APPLY ? "APPLY" : "DRY-RUN"}`);

  const modePages = await fetchAll(specs, "pages", "id,slug,title,folder,archived_at", {
    softDeleteColumn: "archived_at",
  }).then((rows) => rows.filter((r) => r.folder === "Modes"));
  const specPages = await fetchAll(
    specs,
    "pages",
    "id,slug,title,folder,mode_primary,archived_at",
    { softDeleteColumn: "archived_at" },
  ).then((rows) => rows.filter((r) => r.folder === "Specs"));
  const goals = await fetchAll(
    specs,
    "spec_goals",
    "id,page_id,section,parent_goal_id,title,body,order_index,forge_id,sync_hash",
  );
  const tasks = await fetchAll(
    specs,
    "spec_tasks",
    "id,goal_id,parent_task_id,title,body,acceptance,order_index,status,progress,estimate_min,time_logged_min,due_at,start_at,assignee",
  );

  const modeBySlug = new Map(modePages.map((m) => [m.slug, m]));
  const platformMode = modeBySlug.get("Modes/Platform");

  console.log(
    `[import-specs-tree] Specs: ${modePages.length} modes, ${specPages.length} specs, ${goals.length} goals, ${tasks.length} tasks`,
  );

  const plan = {
    root: { id: VRM_ROOT_ID, name: VRM_ROOT_NAME },
    modes: modePages.map((m) => ({ id: m.id, name: m.title, slug: m.slug })),
    specs: specPages.map((s) => ({
      id: s.id,
      name: s.title,
      slug: s.slug,
      parentMode: s.mode_primary ?? "Modes/Platform",
      goalCount: goals.filter((g) => g.page_id === s.id).length,
    })),
    goalsTotal: goals.length,
    tasksTotal: tasks.length,
    orphanSpecs: specPages.filter(
      (s) => !modeBySlug.has(s.mode_primary ?? "Modes/Platform"),
    ),
  };

  console.log(JSON.stringify(plan, null, 2));

  if (plan.orphanSpecs.length > 0) {
    console.error(
      `[import-specs-tree] ${plan.orphanSpecs.length} spec(s) reference a mode_primary with no Modes page -- aborting`,
    );
    process.exitCode = 1;
    return;
  }

  if (!APPLY) {
    console.log("[import-specs-tree] dry run only -- pass --apply to write to Forge");
    return;
  }

  // 1. VRM root project: plain insert (unlocked) then lock via the
  // connector RPC, since connector_upsert_project always sets specs_id =
  // p_id and VRM has no corresponding Specs page.
  const { data: existingRoot } = await forge
    .from("projects")
    .select("id,locked")
    .eq("id", VRM_ROOT_ID)
    .maybeSingle();
  if (!existingRoot) {
    const { error } = await forge.from("projects").insert({
      id: VRM_ROOT_ID,
      name: VRM_ROOT_NAME,
      organization_id: ORG_ID,
    });
    if (error) throw new Error(`create VRM root: ${error.message}`);
  }
  {
    const { error } = await forge.rpc("connector_set_project_lock", {
      p_project_id: VRM_ROOT_ID,
      p_locked: true,
      p_lock_source: "specs:root",
    });
    if (error) throw new Error(`lock VRM root: ${error.message}`);
  }
  console.log(`[import-specs-tree] VRM root project ready: ${VRM_ROOT_ID}`);

  // 2. Mode projects (children of VRM root), locked.
  for (const mode of modePages) {
    const hash = hashOf({ title: mode.title, parent_id: VRM_ROOT_ID });
    const { error } = await forge.rpc("connector_upsert_project", {
      p_id: mode.id,
      p_title: mode.title,
      p_parent_id: VRM_ROOT_ID,
      p_mode_kind: "mode",
      p_spec_slug: null,
      p_sync_hash: hash,
      p_deleted_at: null,
    });
    if (error) throw new Error(`upsert mode project ${mode.slug}: ${error.message}`);
  }
  console.log(`[import-specs-tree] ${modePages.length} mode projects upserted`);

  // 3. Spec projects (children of their mode), locked.
  for (const spec of specPages) {
    const modeSlug = spec.mode_primary ?? "Modes/Platform";
    const parent = modeBySlug.get(modeSlug) ?? platformMode;
    const hash = hashOf({ title: spec.title, parent_id: parent.id });
    const { error } = await forge.rpc("connector_upsert_project", {
      p_id: spec.id,
      p_title: spec.title,
      p_parent_id: parent.id,
      p_mode_kind: "spec",
      p_spec_slug: spec.slug,
      p_sync_hash: hash,
      p_deleted_at: null,
    });
    if (error) throw new Error(`upsert spec project ${spec.slug}: ${error.message}`);
  }
  console.log(`[import-specs-tree] ${specPages.length} spec projects upserted`);

  // 4. Goals (top-level first, so parent_goal_id references resolve on
  // conflict-free insert order -- spec_goals has no cycle risk since it
  // comes from a tree already, but Forge FK on parent_goal_id requires the
  // parent row to exist first).
  const goalsByParent = new Map();
  for (const g of goals) {
    const key = g.parent_goal_id ?? "__root__";
    if (!goalsByParent.has(key)) goalsByParent.set(key, []);
    goalsByParent.get(key).push(g);
  }
  let goalCount = 0;
  async function upsertGoalTree(parentKey) {
    const children = goalsByParent.get(parentKey) ?? [];
    for (const g of children) {
      const hash = g.sync_hash ?? hashOf({ title: g.title, order: g.order_index });
      const { error } = await forge.rpc("connector_upsert_goal", {
        p_id: g.id,
        p_project_id: g.page_id,
        p_section_id: null,
        p_parent_goal_id: g.parent_goal_id,
        p_title: g.title,
        p_body: g.body,
        p_order: g.order_index ?? 0,
        p_sync_hash: hash,
        p_deleted_at: null,
      });
      if (error) throw new Error(`upsert goal ${g.id} (${g.title}): ${error.message}`);
      goalCount += 1;
      await upsertGoalTree(g.id);
    }
  }
  await upsertGoalTree("__root__");
  console.log(`[import-specs-tree] ${goalCount} goals upserted`);

  // 5. Tasks (none in prod today, but handle them for completeness / future
  // re-runs once spec_tasks gets rows).
  const tasksByParent = new Map();
  for (const t of tasks) {
    const key = t.parent_task_id ?? "__root__";
    if (!tasksByParent.has(key)) tasksByParent.set(key, []);
    tasksByParent.get(key).push(t);
  }
  let taskCount = 0;
  async function upsertTaskTree(parentKey) {
    const children = tasksByParent.get(parentKey) ?? [];
    for (const t of children) {
      const hash = hashOf({ title: t.title, status: t.status, order: t.order_index });
      const { error } = await forge.rpc("connector_upsert_task", {
        p_id: t.id,
        p_goal_id: t.goal_id,
        p_parent_task_id: t.parent_task_id,
        p_title: t.title,
        p_body: t.body,
        p_acceptance: t.acceptance,
        p_order: t.order_index ?? 0,
        p_status: t.status ?? "todo",
        p_progress: t.progress ?? 0,
        p_estimate_min: t.estimate_min,
        p_time_logged_min: t.time_logged_min ?? 0,
        p_due_at: t.due_at,
        p_start_at: t.start_at,
        p_assignee: t.assignee,
        p_sync_hash: hash,
        p_deleted_at: null,
      });
      if (error) throw new Error(`upsert task ${t.id} (${t.title}): ${error.message}`);
      taskCount += 1;
      await upsertTaskTree(t.id);
    }
  }
  await upsertTaskTree("__root__");
  console.log(`[import-specs-tree] ${taskCount} tasks upserted`);

  // 6. Connector config: org + root project, for the settings UI / future
  // reconcile jobs (politogy/docs/plans/2026-10-03-specs-forge-sync.md P4.G3).
  {
    const { error } = await forge
      .from("connectors")
      .update({
        config: { org_id: ORG_ID, root_project_id: VRM_ROOT_ID },
        updated_at: new Date().toISOString(),
      })
      .eq("id", "specs");
    if (error) throw new Error(`update connector config: ${error.message}`);
  }

  console.log("[import-specs-tree] done");
  console.log(
    JSON.stringify(
      { vrmRootId: VRM_ROOT_ID, modes: modePages.length, specs: specPages.length, goals: goalCount, tasks: taskCount },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error("[import-specs-tree] failed:", err);
  process.exitCode = 1;
});
