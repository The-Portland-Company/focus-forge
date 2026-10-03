/**
 * Specs <-> Forge sync contract v1 (politogy/docs/sync-contract.md).
 *
 * Covers the real crypto helpers (hmacHex/verifySignature/timingSafeEqual)
 * against the module under test, plus applyInboundEvent's routing and
 * idempotency behavior against a minimal fake Supabase client (the only
 * reasonable boundary to fake here -- a real Postgres connection isn't
 * available in CI).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  hmacHex,
  verifySignature,
  timingSafeEqual,
  applyInboundEvent,
  isConnectorEnabled,
  type SyncEvent,
} from "../connectors/specs-sync";

describe("timingSafeEqual", () => {
  test("equal strings match", () => {
    assert.equal(timingSafeEqual("abc123", "abc123"), true);
  });
  test("different strings do not match", () => {
    assert.equal(timingSafeEqual("abc123", "abc124"), false);
  });
  test("different lengths do not match", () => {
    assert.equal(timingSafeEqual("abc", "abcd"), false);
  });
});

describe("hmacHex / verifySignature", () => {
  const secret = "test-shared-secret";
  const body = JSON.stringify({ events: [{ event_id: "e1" }] });

  test("verifySignature accepts a correctly signed body", async () => {
    const sig = await hmacHex(secret, body);
    const ok = await verifySignature(secret, body, `sha256=${sig}`);
    assert.equal(ok, true);
  });

  test("verifySignature rejects a tampered body", async () => {
    const sig = await hmacHex(secret, body);
    const ok = await verifySignature(secret, body + "x", `sha256=${sig}`);
    assert.equal(ok, false);
  });

  test("verifySignature rejects a wrong secret", async () => {
    const sig = await hmacHex("other-secret", body);
    const ok = await verifySignature(secret, body, `sha256=${sig}`);
    assert.equal(ok, false);
  });

  test("verifySignature rejects a missing header", async () => {
    const ok = await verifySignature(secret, body, null);
    assert.equal(ok, false);
  });

  test("verifySignature rejects a malformed header", async () => {
    const ok = await verifySignature(secret, body, "not-a-signature");
    assert.equal(ok, false);
  });
});

/**
 * Minimal fake of the subset of the Supabase client applyInboundEvent uses:
 * .from(table).select/insert/eq/maybeSingle() and .rpc(name, args).
 */
function createFakeSupabase() {
  const seen = new Map<string, unknown>();
  const rpcCalls: Array<{ name: string; args: unknown }> = [];

  const client = {
    rpcCalls,
    seenEventIds: seen,
    from(table: string) {
      if (table === "sync_events_seen") {
        return {
          select: () => ({
            eq: (_col: string, value: string) => ({
              maybeSingle: async () => ({
                data: seen.has(value) ? seen.get(value) : null,
                error: null,
              }),
            }),
          }),
          insert: async (row: { event_id: string }) => {
            seen.set(row.event_id, row);
            return { data: row, error: null };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
    rpc: async (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      return { data: null, error: null };
    },
  };

  return client;
}

function baseEvent(overrides: Partial<SyncEvent> = {}): SyncEvent {
  return {
    event_id: "11111111-1111-1111-1111-111111111111",
    origin: "specs",
    occurred_at: new Date().toISOString(),
    entity: "goal",
    op: "create",
    entity_id: "22222222-2222-2222-2222-222222222222",
    sync_hash: "sha256:deadbeef",
    data: { project_id: "p1", title: "A goal" },
    ...overrides,
  };
}

describe("applyInboundEvent", () => {
  test("routes a goal event to connector_upsert_goal", async () => {
    const supabase = createFakeSupabase();
    const result = await applyInboundEvent(supabase as any, baseEvent());
    assert.equal(result.applied, true);
    assert.equal(supabase.rpcCalls.length, 1);
    assert.equal(supabase.rpcCalls[0].name, "connector_upsert_goal");
    assert.equal(supabase.seenEventIds.size, 1);
  });

  test("routes a task event to connector_upsert_task", async () => {
    const supabase = createFakeSupabase();
    const event = baseEvent({
      entity: "task",
      data: { goal_id: "g1", title: "A task", status: "todo" },
    });
    const result = await applyInboundEvent(supabase as any, event);
    assert.equal(result.applied, true);
    assert.equal(supabase.rpcCalls[0].name, "connector_upsert_task");
  });

  test("routes a project event to connector_upsert_project", async () => {
    const supabase = createFakeSupabase();
    const event = baseEvent({
      entity: "project",
      data: { title: "A Mode", mode_kind: "mode" },
    });
    const result = await applyInboundEvent(supabase as any, event);
    assert.equal(result.applied, true);
    assert.equal(supabase.rpcCalls[0].name, "connector_upsert_project");
  });

  test("routes a section event to connector_upsert_section", async () => {
    const supabase = createFakeSupabase();
    const event = baseEvent({
      entity: "section",
      data: { project_id: "p1", title: "A section", order: 1 },
    });
    const result = await applyInboundEvent(supabase as any, event);
    assert.equal(result.applied, true);
    assert.equal(supabase.rpcCalls[0].name, "connector_upsert_section");
  });

  test("a duplicate event_id is a no-op (idempotency, contract §2/§9)", async () => {
    const supabase = createFakeSupabase();
    const event = baseEvent();
    const first = await applyInboundEvent(supabase as any, event);
    assert.equal(first.applied, true);

    const second = await applyInboundEvent(supabase as any, event);
    assert.equal(second.applied, false);
    assert.equal(second.reason, "duplicate");
    // Only the first call should have hit the RPC.
    assert.equal(supabase.rpcCalls.length, 1);
  });

  test("a delete op sets deleted_at from the payload or occurred_at", async () => {
    const supabase = createFakeSupabase();
    const event = baseEvent({
      op: "delete",
      data: { project_id: "p1", title: "A goal" },
    });
    await applyInboundEvent(supabase as any, event);
    const call = supabase.rpcCalls[0];
    assert.ok((call.args as any).p_deleted_at);
  });

  test("a restore op clears deleted_at", async () => {
    const supabase = createFakeSupabase();
    const event = baseEvent({
      op: "restore",
      data: { project_id: "p1", title: "A goal", deleted_at: "2026-01-01T00:00:00.000Z" },
    });
    await applyInboundEvent(supabase as any, event);
    const call = supabase.rpcCalls[0];
    assert.equal((call.args as any).p_deleted_at, null);
  });

  test("an unknown entity is rejected without an RPC call", async () => {
    const supabase = createFakeSupabase();
    const event = baseEvent({ entity: "widget" as any });
    const result = await applyInboundEvent(supabase as any, event);
    assert.equal(result.applied, false);
    assert.equal(result.reason, "unknown_entity");
    assert.equal(supabase.rpcCalls.length, 0);
  });
});

describe("isConnectorEnabled", () => {
  function fakeConnectorsSupabase(row: { enabled: boolean } | null) {
    return {
      from: (table: string) => {
        assert.equal(table, "connectors");
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: row, error: null }),
            }),
          }),
        };
      },
    };
  }

  test("returns true when enabled", async () => {
    const supabase = fakeConnectorsSupabase({ enabled: true });
    assert.equal(await isConnectorEnabled(supabase as any), true);
  });

  test("returns false when explicitly disabled (kill switch, §11)", async () => {
    const supabase = fakeConnectorsSupabase({ enabled: false });
    assert.equal(await isConnectorEnabled(supabase as any), false);
  });

  test("fails open only when the row is entirely missing", async () => {
    const supabase = fakeConnectorsSupabase(null);
    assert.equal(await isConnectorEnabled(supabase as any), true);
  });
});
