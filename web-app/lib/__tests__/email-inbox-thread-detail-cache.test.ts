import assert from "node:assert/strict";
import test from "node:test";

import {
  createThreadDetailCache,
  isThreadDetailFresh,
} from "../email-inbox/thread-detail-cache";

test("get/set round-trip and invalidate", () => {
  const cache = createThreadDetailCache<{ id: string }>();
  assert.equal(cache.get("t1"), null);

  cache.set("t1", { id: "t1" });
  assert.deepEqual(cache.get("t1"), { id: "t1" });

  cache.invalidate("t1");
  assert.equal(cache.get("t1"), null);
});

test("evicts the least recently used entry past the cap", () => {
  const cache = createThreadDetailCache<number>(3);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);

  // Touch "a" so "b" becomes the oldest.
  cache.get("a");
  cache.set("d", 4);

  assert.equal(cache.size(), 3);
  assert.equal(cache.get("b"), null);
  assert.equal(cache.get("a"), 1);
  assert.equal(cache.get("d"), 4);
});

test("isThreadDetailFresh: matching signals skip the refetch", () => {
  assert.equal(
    isThreadDetailFresh(
      { updatedAt: "2026-07-23T10:00:00Z", messageCount: 3 },
      { updatedAt: "2026-07-23T10:00:00Z", messageCount: 3 },
    ),
    true,
  );
});

test("isThreadDetailFresh: a newer row or message forces a revalidate", () => {
  assert.equal(
    isThreadDetailFresh(
      { updatedAt: "2026-07-23T10:00:00Z", messageCount: 3 },
      { updatedAt: "2026-07-23T10:05:00Z", messageCount: 3 },
    ),
    false,
  );
  assert.equal(
    isThreadDetailFresh(
      { updatedAt: "2026-07-23T10:00:00Z", messageCount: 3 },
      { updatedAt: "2026-07-23T10:00:00Z", messageCount: 4 },
    ),
    false,
  );
});

test("isThreadDetailFresh: missing signals err on the side of refetching", () => {
  assert.equal(isThreadDetailFresh(null, { updatedAt: "x" }), false);
  assert.equal(isThreadDetailFresh({ updatedAt: "x" }, null), false);
  assert.equal(isThreadDetailFresh({}, { updatedAt: "x" }), false);
  assert.equal(isThreadDetailFresh({ updatedAt: "x" }, {}), false);
});
