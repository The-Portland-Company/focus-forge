// Covers supabase/migrations/20260925090000_task_source_tpc_identity.sql:
// tasks.source is always server-derived (from the authenticated TPC Auth
// client) and never accepted from a request body; tasks.source_url is
// accepted from the body but must be a valid http(s) URL.
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTaskInput, serializeMobileTask } from "@/lib/mobile/api";
import { sourceForTpcClientId, TASK_SOURCES, TPC_CLIENT_SOURCE } from "@/lib/task-sources";

test("sourceForTpcClientId maps the registered swarm-tester client id", () => {
  assert.equal(sourceForTpcClientId("swarm-tester-focus-forge"), "swarm-tester");
  assert.ok(TASK_SOURCES[TPC_CLIENT_SOURCE["swarm-tester-focus-forge"]]);
});

test("sourceForTpcClientId returns null for an unregistered or missing client id", () => {
  assert.equal(sourceForTpcClientId("some-other-client"), null);
  assert.equal(sourceForTpcClientId(null), null);
  assert.equal(sourceForTpcClientId(undefined), null);
});

test("normalizeTaskInput ignores `source` in the request body", () => {
  const result = normalizeTaskInput({ name: "x", source: "swarm-tester" });
  assert.equal("source" in result, false);
});

test("normalizeTaskInput ignores `source` on an update payload too", () => {
  const result = normalizeTaskInput({ source: "anything" });
  assert.equal("source" in result, false);
});

test("normalizeTaskInput accepts a valid http(s) source_url", () => {
  const result = normalizeTaskInput({ name: "x", sourceUrl: "https://example.com/run/123" });
  assert.equal(result.source_url, "https://example.com/run/123");
});

test("normalizeTaskInput accepts the snake_case source_url alias", () => {
  const result = normalizeTaskInput({ name: "x", source_url: "http://example.com" });
  assert.equal(result.source_url, "http://example.com");
});

test("normalizeTaskInput rejects a non-http(s) source_url", () => {
  assert.throws(() => normalizeTaskInput({ name: "x", sourceUrl: "javascript:alert(1)" }));
  assert.throws(() => normalizeTaskInput({ name: "x", sourceUrl: "not-a-url" }));
});

test("serializeMobileTask surfaces source/source_url, defaulting to null", () => {
  const task = serializeMobileTask({ id: "1", name: "x" });
  assert.equal(task.source, null);
  assert.equal(task.source_url, null);
});

test("serializeMobileTask preserves stored source/source_url", () => {
  const task = serializeMobileTask({
    id: "1",
    name: "x",
    source: "swarm-tester",
    source_url: "https://example.com/run/1",
  });
  assert.equal(task.source, "swarm-tester");
  assert.equal(task.source_url, "https://example.com/run/1");
});
