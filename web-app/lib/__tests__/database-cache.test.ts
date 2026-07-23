import assert from "node:assert/strict";
import test from "node:test";

import {
  DATABASE_CACHE_FRESH_MS,
  DATABASE_CACHE_MAX_AGE_MS,
  DATABASE_CACHE_MAX_INBOX_ITEMS,
  clearCachedDatabase,
  getDatabaseCacheKey,
  readCachedDatabase,
  writeCachedDatabase,
} from "../database-cache";
import type { Database } from "../types";

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    _store: store,
  };
}

function createDatabase(overrides: Partial<Database> = {}): Database {
  return {
    users: [],
    organizations: [],
    projects: [],
    tasks: [],
    mailboxes: [],
    inboxItems: [],
    emailRules: [],
    summaryProfiles: [],
    ruleStats: { active: 0, quarantine: 0, alwaysDelete: 0 },
    quarantineCount: 0,
    tags: [],
    sections: [],
    taskSections: [],
    userSectionPreferences: [],
    timeBlocks: [],
    timeBlockTasks: [],
    settings: { showCompletedTasks: true },
    ...overrides,
  } as Database;
}

test("round-trips a snapshot including inbox items", () => {
  const storage = createMemoryStorage();
  const data = createDatabase({
    inboxItems: [{ id: "thread-1" }, { id: "thread-2" }] as Database["inboxItems"],
  });

  writeCachedDatabase("user-1", data, storage, 1_000);
  const cached = readCachedDatabase("user-1", storage, 2_000);

  assert.ok(cached);
  assert.equal(cached.data.inboxItems.length, 2);
  assert.equal(cached.data.inboxItems[0].id, "thread-1");
  assert.equal(cached.isFresh, true);
});

test("snapshots are per-user", () => {
  const storage = createMemoryStorage();
  writeCachedDatabase("user-1", createDatabase(), storage, 1_000);

  assert.equal(readCachedDatabase("user-2", storage, 2_000), null);
  assert.ok(readCachedDatabase("user-1", storage, 2_000));
});

test("stale snapshot still hydrates but is flagged not fresh", () => {
  const storage = createMemoryStorage();
  writeCachedDatabase("user-1", createDatabase(), storage, 0);

  const cached = readCachedDatabase(
    "user-1",
    storage,
    DATABASE_CACHE_FRESH_MS + 1,
  );
  assert.ok(cached);
  assert.equal(cached.isFresh, false);
});

test("snapshot past the hard max age is discarded", () => {
  const storage = createMemoryStorage();
  writeCachedDatabase("user-1", createDatabase(), storage, 0);

  assert.equal(
    readCachedDatabase("user-1", storage, DATABASE_CACHE_MAX_AGE_MS + 1),
    null,
  );
  // And the expired entry was removed from storage.
  assert.equal(storage._store.size, 0);
});

test("corrupt or wrong-shape payloads are dropped, not thrown", () => {
  const storage = createMemoryStorage();
  storage.setItem(getDatabaseCacheKey("user-1"), "not json{{{");
  assert.equal(readCachedDatabase("user-1", storage, 1_000), null);

  storage.setItem(
    getDatabaseCacheKey("user-1"),
    JSON.stringify({ cachedAt: 1, data: { tasks: "nope" } }),
  );
  assert.equal(readCachedDatabase("user-1", storage, 1_000), null);
});

test("inbox items are capped on write", () => {
  const storage = createMemoryStorage();
  const items = Array.from(
    { length: DATABASE_CACHE_MAX_INBOX_ITEMS + 50 },
    (_, index) => ({ id: `thread-${index}` }),
  ) as Database["inboxItems"];

  writeCachedDatabase("user-1", createDatabase({ inboxItems: items }), storage, 0);
  const cached = readCachedDatabase("user-1", storage, 1);

  assert.ok(cached);
  assert.equal(cached.data.inboxItems.length, DATABASE_CACHE_MAX_INBOX_ITEMS);
});

test("clearCachedDatabase removes only that user's snapshot", () => {
  const storage = createMemoryStorage();
  writeCachedDatabase("user-1", createDatabase(), storage, 0);
  writeCachedDatabase("user-2", createDatabase(), storage, 0);

  clearCachedDatabase("user-1", storage);

  assert.equal(readCachedDatabase("user-1", storage, 1), null);
  assert.ok(readCachedDatabase("user-2", storage, 1));
});

test("a snapshot missing inboxItems hydrates with an empty list", () => {
  const storage = createMemoryStorage();
  const data = createDatabase();
  delete (data as { inboxItems?: unknown }).inboxItems;
  storage.setItem(
    getDatabaseCacheKey("user-1"),
    JSON.stringify({ cachedAt: 0, data }),
  );

  const cached = readCachedDatabase("user-1", storage, 1);
  assert.ok(cached);
  assert.deepEqual(cached.data.inboxItems, []);
});
