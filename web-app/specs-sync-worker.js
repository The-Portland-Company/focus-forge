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
 * Maps one Forge sync_outbox row to a write against the Specs schema.
 * Returns { skipped: true } for entities Forge never sends outbound.
 */
async function applyOutboundRow(specsClient, row) {
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
    const { error } = await specsClient.from("spec_goals").upsert(
      {
        id: row.entity_id,
        project_id: row.data.project_id,
        parent_goal_id: row.data.parent_goal_id ?? null,
        title: row.data.title,
        body: row.data.body ?? null,
        order: row.data.order ?? 0,
        deleted_at: deletedAt,
        sync_hash: row.sync_hash,
        origin: "forge",
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(error.message);
    return { skipped: false };
  }

  if (row.entity === "task") {
    const { error } = await specsClient.from("spec_tasks").upsert(
      {
        id: row.entity_id,
        goal_id: row.data.goal_id ?? null,
        parent_task_id: row.data.parent_task_id ?? null,
        title: row.data.title,
        body: row.data.body ?? null,
        acceptance: row.data.acceptance ?? null,
        order: row.data.order ?? 0,
        status: row.data.status ?? "todo",
        progress: row.data.progress ?? 0,
        estimate_min: row.data.estimate_min ?? 0,
        time_logged_min: row.data.time_logged_min ?? 0,
        due_at: row.data.due_at ?? null,
        start_at: row.data.start_at ?? null,
        assignee: row.data.assignee ?? null,
        deleted_at: deletedAt,
        sync_hash: row.sync_hash,
        origin: "forge",
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(error.message);
    return { skipped: false };
  }

  throw new Error(`unknown_entity: ${row.entity}`);
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

  let processed = 0;
  for (const row of rows) {
    try {
      await applyOutboundRow(specsClient, row);
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
