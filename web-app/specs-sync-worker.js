#!/usr/bin/env node

// Forge -> Specs outbound sync worker (P4.G2, P5.G1).
//
// Drains public.sync_outbox (populated by the DB triggers in
// supabase/migrations/20261003220000_specs_forge_connectors.sql) and
// writes directly to the Specs Supabase project (lzhzqtzwlwdffxhjjrba) via
// a service-role key, per politogy/docs/sync-contract.md §2:
//
//   "For Forge->Specs (outbound), DO NOT POST to
//   specs.politogyvrm.com/api/sync/* (WAF-challenged, unfixable); instead
//   write DIRECTLY to the Specs Supabase via SPECS_SUPABASE_SERVICE_KEY."
//
// `project` entities are never sent outbound (contract §4: "Forge sends
// nothing for project except a rejected-delete audit log entry, local
// only") -- those rows are just marked sent with no network/DB write.
// `section` / `goal` / `task` rows are upserted into the Specs tables
// (`spec_goals` / `spec_tasks`) the P2 wave introduces. Until P2 ships,
// those tables don't exist yet on the Specs side; failures there are
// retried/parked by the same backoff + dead-letter path as any other
// failure, so this worker self-heals once P2 lands with no redeploy.

const { createClient } = require("@supabase/supabase-js");

const POLL_INTERVAL_MS = 15 * 1000;
const BATCH_SIZE = 25;

// Contract §10: 1s, 5s, 30s, 5m, 30m, then every 6h up to 7 days.
const BACKOFF_MS = [1_000, 5_000, 30_000, 5 * 60_000, 30 * 60_000];
const BACKOFF_FLOOR_MS = 6 * 60 * 60_000;
const DEAD_LETTER_AFTER_MS = 7 * 24 * 60 * 60_000;

function nextBackoffMs(attempts) {
  if (attempts < BACKOFF_MS.length) {
    return BACKOFF_MS[attempts];
  }
  return BACKOFF_FLOOR_MS;
}

function createForgeAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Forge Supabase admin credentials for specs sync worker");
  }
  return createClient(url.trim(), key.trim(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function createSpecsAdminClient() {
  const url = process.env.SPECS_SUPABASE_URL;
  const key = process.env.SPECS_SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    return null;
  }
  return createClient(url.trim(), key.trim(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Looks up the Specs page id a Forge project corresponds to (set on import
 * / by an inbound connector_upsert_project call as `projects.specs_id`).
 * Returns null when the project was never a Specs-synced project (e.g. an
 * ordinary, non-connector Forge project with a stray goal).
 */
async function resolveSpecsPageId(forgeClient, forgeProjectId) {
  if (!forgeProjectId) return null;
  const { data, error } = await forgeClient
    .from("projects")
    .select("specs_id")
    .eq("id", forgeProjectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.specs_id ?? null;
}

/**
 * Looks up the free-text section heading for a Forge section row, to
 * populate `spec_goals.section` (Specs has no standalone sections table --
 * see docs/sync-contract.md §1).
 */
async function resolveSectionTitle(forgeClient, forgeSectionId) {
  if (!forgeSectionId) return null;
  const { data, error } = await forgeClient
    .from("sections")
    .select("name")
    .eq("id", forgeSectionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.name ?? null;
}

/**
 * Maps one Forge sync_outbox row to a write against the Specs schema.
 * Returns { skipped: true } for entities Forge never sends outbound.
 */
async function applyOutboundRow(specsClient, row, forgeClient) {
  if (row.entity === "project") {
    // Local-only per contract §4 -- nothing to send.
    return { skipped: true };
  }

  if (!specsClient) {
    throw new Error("specs_client_not_configured");
  }

  const deletedAt = row.data?.deleted_at ?? null;

  if (row.entity === "section") {
    // Specs models sections inside a spec's goals_md, not a standalone
    // table yet in P2 -- sections are folded into the goal payload's
    // section_id below once P2 ships. For now this is a local no-op success
    // (nothing in Specs schema to target), recorded as sent so it doesn't
    // dead-letter.
    return { skipped: true };
  }

  if (row.entity === "goal") {
    // spec_goals columns are page_id / order_index / sync_origin (see
    // supabase/migrations/20261003210000_spec_goals_tasks.sql in the specs
    // repo) -- NOT project_id / order / origin. The Forge project this
    // goal belongs to maps to a Specs page via projects.specs_id.
    const pageId = await resolveSpecsPageId(forgeClient, row.data.project_id);
    if (!pageId) {
      throw new Error(
        `specs_page_not_found: forge project ${row.data.project_id} has no specs_id (not a Specs-synced project)`,
      );
    }
    const section = await resolveSectionTitle(forgeClient, row.data.section_id);
    const { error } = await specsClient.from("spec_goals").upsert(
      {
        id: row.entity_id,
        page_id: pageId,
        section,
        parent_goal_id: row.data.parent_goal_id ?? null,
        title: row.data.title,
        body: row.data.body ?? null,
        order_index: row.data.order ?? 0,
        deleted_at: deletedAt,
        forge_id: row.entity_id,
        sync_hash: row.sync_hash,
        sync_origin: "forge",
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(error.message);
    return { skipped: false };
  }

  if (row.entity === "task") {
    // spec_tasks columns are order_index / sync_origin, not order / origin.
    const { error } = await specsClient.from("spec_tasks").upsert(
      {
        id: row.entity_id,
        goal_id: row.data.goal_id ?? null,
        parent_task_id: row.data.parent_task_id ?? null,
        title: row.data.title,
        body: row.data.body ?? null,
        acceptance: row.data.acceptance ?? null,
        order_index: row.data.order ?? 0,
        status: row.data.status ?? "todo",
        progress: row.data.progress ?? 0,
        estimate_min: row.data.estimate_min ?? 0,
        time_logged_min: row.data.time_logged_min ?? 0,
        due_at: row.data.due_at ?? null,
        start_at: row.data.start_at ?? null,
        assignee: row.data.assignee ?? null,
        deleted_at: deletedAt,
        forge_id: row.entity_id,
        sync_hash: row.sync_hash,
        sync_origin: "forge",
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(error.message);
    return { skipped: false };
  }

  throw new Error(`unknown_entity: ${row.entity}`);
}

// Dependency-order the batch so FK targets always land before the rows
// that reference them: goals before their tasks, and within each entity
// type, a parent (parent_goal_id / parent_task_id) before its children.
// Only dependencies *within this same batch* are modeled -- a reference
// to an already-sent row (earlier batch) needs no reordering here, and a
// reference to a row outside this batch (not yet selected) still fails
// fast and backs off/dead-letters as before, same as prior behavior.
// Kahn's algorithm, stable on ties via the incoming occurred_at order.
function topologicallySortOutboxRows(rows) {
  const byEntityId = new Map();
  for (const row of rows) {
    byEntityId.set(`${row.entity}:${row.entity_id}`, row);
  }

  const dependsOn = (row) => {
    const deps = [];
    if (row.entity === "task") {
      if (row.data?.goal_id && byEntityId.has(`goal:${row.data.goal_id}`)) {
        deps.push(byEntityId.get(`goal:${row.data.goal_id}`));
      }
      if (
        row.data?.parent_task_id &&
        byEntityId.has(`task:${row.data.parent_task_id}`)
      ) {
        deps.push(byEntityId.get(`task:${row.data.parent_task_id}`));
      }
    } else if (row.entity === "goal") {
      if (
        row.data?.parent_goal_id &&
        byEntityId.has(`goal:${row.data.parent_goal_id}`)
      ) {
        deps.push(byEntityId.get(`goal:${row.data.parent_goal_id}`));
      }
    }
    return deps;
  };

  const indegree = new Map();
  const dependents = new Map(); // row -> rows that depend on it
  for (const row of rows) {
    indegree.set(row, 0);
    dependents.set(row, []);
  }
  for (const row of rows) {
    for (const dep of dependsOn(row)) {
      indegree.set(row, (indegree.get(row) || 0) + 1);
      dependents.get(dep).push(row);
    }
  }

  // Stable queue: rows in original (occurred_at ascending) order whose
  // dependencies (if any) are already satisfied.
  const queue = rows.filter((row) => indegree.get(row) === 0);
  const sorted = [];
  const seen = new Set();

  while (queue.length > 0) {
    const row = queue.shift();
    if (seen.has(row)) continue;
    seen.add(row);
    sorted.push(row);
    for (const dependent of dependents.get(row)) {
      indegree.set(dependent, indegree.get(dependent) - 1);
      if (indegree.get(dependent) === 0) {
        queue.push(dependent);
      }
    }
  }

  // Any row left out (a cycle, which shouldn't happen for a tree) keeps
  // its original relative order appended at the end rather than being
  // dropped, so it still gets attempted (and can dead-letter normally).
  for (const row of rows) {
    if (!seen.has(row)) sorted.push(row);
  }

  return sorted;
}

async function drainOnce(forgeClient, specsClient) {
  const { data: rows, error } = await forgeClient
    .from("sync_outbox")
    .select("*")
    .is("sent_at", null)
    .eq("dead", false)
    .lte("next_attempt_at", new Date().toISOString())
    .order("occurred_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    throw error;
  }
  if (!rows || rows.length === 0) {
    return { processed: 0 };
  }

  const orderedRows = topologicallySortOutboxRows(rows);

  let processed = 0;
  for (const row of orderedRows) {
    try {
      await applyOutboundRow(specsClient, row, forgeClient);
      await forgeClient
        .from("sync_outbox")
        .update({ sent_at: new Date().toISOString() })
        .eq("id", row.id);
      processed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const attempts = (row.attempts || 0) + 1;
      const ageMs = Date.now() - new Date(row.occurred_at).getTime();

      if (ageMs >= DEAD_LETTER_AFTER_MS) {
        await forgeClient.from("sync_dead_letters").insert({
          event_id: row.event_id,
          entity: row.entity,
          op: row.op,
          entity_id: row.entity_id,
          data: row.data,
          last_error: message,
          attempts,
        });
        await forgeClient
          .from("sync_outbox")
          .update({ dead: true, attempts, last_error: message })
          .eq("id", row.id);
        console.error("[SpecsSyncWorker] dead-lettered outbox row", {
          id: row.id,
          entity: row.entity,
          attempts,
          error: message,
        });
      } else {
        const delayMs = nextBackoffMs(attempts - 1);
        await forgeClient
          .from("sync_outbox")
          .update({
            attempts,
            last_error: message,
            next_attempt_at: new Date(Date.now() + delayMs).toISOString(),
          })
          .eq("id", row.id);
        console.error("[SpecsSyncWorker] outbox row failed, will retry", {
          id: row.id,
          entity: row.entity,
          attempts,
          retryInMs: delayMs,
          error: message,
        });
      }
    }
  }

  if (processed > 0) {
    await forgeClient
      .from("connectors")
      .update({ last_outbound_at: new Date().toISOString() })
      .eq("id", "specs");
  }

  return { processed };
}

async function isEnabled(forgeClient) {
  const { data } = await forgeClient
    .from("connectors")
    .select("enabled")
    .eq("id", "specs")
    .maybeSingle();
  return data ? data.enabled !== false : true;
}

async function run(options = {}) {
  const exitOnShutdown = options.exitOnShutdown !== false;
  const registerSignalHandlers = options.registerSignalHandlers !== false;

  console.log("[SpecsSyncWorker] worker starting");

  const forgeClient = createForgeAdminClient();
  let stopping = false;

  const tick = async () => {
    if (stopping) return;
    try {
      const enabled = await isEnabled(forgeClient);
      if (!enabled) {
        return;
      }
      const specsClient = createSpecsAdminClient();
      const { processed } = await drainOnce(forgeClient, specsClient);
      if (processed > 0) {
        console.log("[SpecsSyncWorker] drained outbox", { processed });
      }
    } catch (error) {
      console.error("[SpecsSyncWorker] drain cycle failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  await tick();
  const timer = setInterval(() => void tick(), POLL_INTERVAL_MS);

  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    if (exitOnShutdown) {
      process.exit(0);
    }
  };

  if (registerSignalHandlers) {
    process.on("SIGTERM", () => void shutdown());
    process.on("SIGINT", () => void shutdown());
  }

  return shutdown;
}

module.exports = {
  startSpecsSyncWorker: run,
  nextBackoffMs,
  applyOutboundRow,
  topologicallySortOutboxRows,
  BACKOFF_MS,
  BACKOFF_FLOOR_MS,
  DEAD_LETTER_AFTER_MS,
};

if (require.main === module) {
  run({ exitOnShutdown: true, registerSignalHandlers: true }).catch((error) => {
    console.error("[SpecsSyncWorker] worker crashed", error);
    process.exit(1);
  });
}
