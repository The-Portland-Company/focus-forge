/**
 * Forge -> Specs outbound sync worker (specs-sync-worker.js), per
 * politogy/docs/sync-contract.md §10 (retry/backoff/dead-letter).
 *
 * The worker is plain CJS (same convention as email-live-sync-worker.js, so
 * start.js can require() it directly without a build step) -- required here
 * from a .ts test via node's CJS interop, same as any other npm package.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

const workerPath = path.join(__dirname, "..", "..", "specs-sync-worker.js");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const worker = require(workerPath);

describe("nextBackoffMs", () => {
  test("follows the contract §10 schedule for the first five attempts", () => {
    assert.equal(worker.nextBackoffMs(0), 1_000);
    assert.equal(worker.nextBackoffMs(1), 5_000);
    assert.equal(worker.nextBackoffMs(2), 30_000);
    assert.equal(worker.nextBackoffMs(3), 5 * 60_000);
    assert.equal(worker.nextBackoffMs(4), 30 * 60_000);
  });

  test("floors at 6h after the schedule is exhausted", () => {
    assert.equal(worker.nextBackoffMs(5), 6 * 60 * 60_000);
    assert.equal(worker.nextBackoffMs(100), 6 * 60 * 60_000);
  });
});

describe("applyOutboundRow", () => {
  test("a project row is skipped (contract §4: Forge sends nothing for project)", async () => {
    const result = await worker.applyOutboundRow(null, {
      entity: "project",
      entity_id: "p1",
      data: {},
    });
    assert.equal(result.skipped, true);
  });

  test("a section row is currently skipped (no standalone Specs table yet)", async () => {
    const result = await worker.applyOutboundRow(
      { from: () => assert.fail("should not touch Specs client for sections yet") },
      { entity: "section", entity_id: "s1", data: { project_id: "p1", title: "Sec" } },
    );
    assert.equal(result.skipped, true);
  });

  test("a goal row without a configured Specs client throws (parks for retry)", async () => {
    await assert.rejects(
      () =>
        worker.applyOutboundRow(null, {
          entity: "goal",
          entity_id: "g1",
          data: { project_id: "p1", title: "Goal" },
        }),
      /specs_client_not_configured/,
    );
  });

  test("a goal row upserts into spec_goals when a Specs client is configured", async () => {
    const calls: Array<{ table: string; row: unknown }> = [];
    const fakeSpecsClient = {
      from: (table: string) => ({
        upsert: async (row: unknown) => {
          calls.push({ table, row });
          return { error: null };
        },
      }),
    };

    const result = await worker.applyOutboundRow(fakeSpecsClient, {
      entity: "goal",
      entity_id: "g1",
      sync_hash: "sha256:abc",
      data: { project_id: "p1", title: "Goal", order: 2 },
    });

    assert.equal(result.skipped, false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].table, "spec_goals");
    assert.equal((calls[0].row as any).id, "g1");
    assert.equal((calls[0].row as any).origin, "forge");
  });

  test("a task row upserts into spec_tasks when a Specs client is configured", async () => {
    const calls: Array<{ table: string; row: unknown }> = [];
    const fakeSpecsClient = {
      from: (table: string) => ({
        upsert: async (row: unknown) => {
          calls.push({ table, row });
          return { error: null };
        },
      }),
    };

    const result = await worker.applyOutboundRow(fakeSpecsClient, {
      entity: "task",
      entity_id: "t1",
      sync_hash: "sha256:abc",
      data: { goal_id: "g1", title: "Task", status: "in_progress" },
    });

    assert.equal(result.skipped, false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].table, "spec_tasks");
    assert.equal((calls[0].row as any).id, "t1");
  });

  test("surfaces the Specs error (caller's retry/dead-letter loop handles it, e.g. P2 not shipped)", async () => {
    const fakeSpecsClient = {
      from: () => ({
        upsert: async () => ({ error: { message: 'relation "spec_goals" does not exist' } }),
      }),
    };

    await assert.rejects(
      () =>
        worker.applyOutboundRow(fakeSpecsClient, {
          entity: "goal",
          entity_id: "g1",
          data: { project_id: "p1", title: "Goal" },
        }),
      /does not exist/,
    );
  });

  test("an unknown entity throws", async () => {
    await assert.rejects(
      () =>
        worker.applyOutboundRow(
          { from: () => ({ upsert: async () => ({ error: null }) }) },
          { entity: "widget", entity_id: "w1", data: {} },
        ),
      /unknown_entity/,
    );
  });
});
