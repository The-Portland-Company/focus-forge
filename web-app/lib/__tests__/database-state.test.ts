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

test("mergeDatabasePayload normalizes missing mailboxes/inboxItems to arrays", () => {
  // A server-seeded payload can omit email collections; the Today view maps/
  // reduces over database.mailboxes, so undefined here previously crashed it.
  const next = { tasks: [], projects: [], organizations: [] } as any;
  const merged = mergeDatabasePayload(null, next, {});
  assert.deepEqual(merged.mailboxes, []);
  assert.deepEqual(merged.inboxItems, []);
});

test("mergeDatabasePayload keeps provided mailboxes/inboxItems", () => {
  const next = {
    mailboxes: [{ id: "mb-1" }],
    inboxItems: [{ id: "t-1" }],
    tasks: [],
    projects: [],
    organizations: [],
  } as any;
  const merged = mergeDatabasePayload(null, next, {});
  assert.deepEqual(merged.mailboxes, [{ id: "mb-1" }]);
  assert.deepEqual(merged.inboxItems, [{ id: "t-1" }]);
});
