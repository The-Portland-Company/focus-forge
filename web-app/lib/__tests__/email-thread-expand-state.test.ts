import assert from "node:assert/strict";
import { test } from "node:test";

import {
  areAllThreadMessagesExpanded,
  getThreadExpandStorageKey,
  isThreadMessageExpanded,
  parseThreadExpandState,
  serializeThreadExpandState,
  toggleThreadMessageExpanded,
} from "@/lib/email-inbox/thread-expand-state";

test("getThreadExpandStorageKey namespaces per thread id", () => {
  assert.equal(
    getThreadExpandStorageKey("thread-1"),
    "email-thread-expand:thread-1",
  );
});

test("parseThreadExpandState handles all, sets, and invalid values", () => {
  assert.equal(parseThreadExpandState("all"), "all");

  const parsed = parseThreadExpandState(JSON.stringify(["a", "b"]));
  assert.ok(parsed instanceof Set);
  assert.deepEqual(Array.from(parsed as Set<string>), ["a", "b"]);

  assert.equal((parseThreadExpandState(null) as Set<string>).size, 0);
  assert.equal((parseThreadExpandState("garbage") as Set<string>).size, 0);
});

test("serializeThreadExpandState round-trips and clears empties", () => {
  assert.equal(serializeThreadExpandState("all"), "all");
  assert.equal(serializeThreadExpandState(new Set<string>()), null);
  assert.equal(
    serializeThreadExpandState(new Set(["x"])),
    JSON.stringify(["x"]),
  );
});

test("isThreadMessageExpanded respects all and explicit sets", () => {
  assert.equal(isThreadMessageExpanded("all", "anything"), true);
  assert.equal(isThreadMessageExpanded(new Set(["a"]), "a"), true);
  assert.equal(isThreadMessageExpanded(new Set(["a"]), "b"), false);
});

test("areAllThreadMessagesExpanded compares against every message id", () => {
  assert.equal(areAllThreadMessagesExpanded("all", ["a", "b"]), true);
  assert.equal(
    areAllThreadMessagesExpanded(new Set(["a", "b"]), ["a", "b"]),
    true,
  );
  assert.equal(
    areAllThreadMessagesExpanded(new Set(["a"]), ["a", "b"]),
    false,
  );
  assert.equal(areAllThreadMessagesExpanded(new Set<string>(), []), false);
});

test("toggleThreadMessageExpanded materializes all then collapses one", () => {
  const fromAll = toggleThreadMessageExpanded("all", "b", ["a", "b", "c"]);
  assert.ok(fromAll instanceof Set);
  assert.deepEqual(
    Array.from(fromAll as Set<string>).sort(),
    ["a", "c"],
  );

  const expanded = toggleThreadMessageExpanded(
    new Set<string>(),
    "a",
    ["a", "b"],
  );
  assert.deepEqual(Array.from(expanded as Set<string>), ["a"]);
});
