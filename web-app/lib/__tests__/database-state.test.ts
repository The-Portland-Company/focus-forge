/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { mergeDatabasePayload } from "../database-state";

test("mergeDatabasePayload preserves inbox items when a deferred payload omits them", () => {
  const previous = {
    inboxItems: [{ id: "thread-1" }],
    quarantineCount: 3,
    tasks: [],
    projects: [],
    organizations: [],
  } as any;

  const next = {
    inboxItems: [],
    quarantineCount: 0,
    tasks: [],
    projects: [],
    organizations: [],
  } as any;

  const merged = mergeDatabasePayload(previous, next, {
    preserveInboxItems: true,
  });

  assert.deepEqual(merged.inboxItems, previous.inboxItems);
  assert.equal(merged.quarantineCount, 3);
});

test("mergeDatabasePayload uses fresh inbox items when they are present", () => {
  const previous = {
    inboxItems: [{ id: "thread-1" }],
    quarantineCount: 1,
    tasks: [],
    projects: [],
    organizations: [],
  } as any;

  const next = {
    inboxItems: [{ id: "thread-2" }],
    quarantineCount: 4,
    tasks: [],
    projects: [],
    organizations: [],
  } as any;

  const merged = mergeDatabasePayload(previous, next, {
    preserveInboxItems: true,
  });

  assert.deepEqual(merged.inboxItems, next.inboxItems);
  assert.equal(merged.quarantineCount, 4);
});
