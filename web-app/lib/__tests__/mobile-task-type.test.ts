// Covers the native task `type` field ('task' | 'bug' | 'feature') added in
// supabase/migrations/20260924010000_task_type.sql: normalizeTaskInput must
// accept it on create/update, reject bad values, and serializeMobileTask
// must always return a valid type.
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeTaskInput, serializeMobileTask, TASK_TYPES } from "@/lib/mobile/api";

test("TASK_TYPES is the documented set", () => {
  assert.deepEqual(TASK_TYPES, ["task", "bug", "feature"]);
});

test("normalizeTaskInput passes through a valid type", () => {
  const result = normalizeTaskInput({ name: "Fix crash", type: "bug" });
  assert.equal(result.type, "bug");
});

test("normalizeTaskInput drops an invalid type rather than erroring", () => {
  const result = normalizeTaskInput({ name: "x", type: "epic" });
  assert.equal("type" in result, false);
});

test("normalizeTaskInput leaves type unset when not provided (DB default applies)", () => {
  const result = normalizeTaskInput({ name: "x" });
  assert.equal("type" in result, false);
});

test("serializeMobileTask defaults to 'task' when the row has no type", () => {
  const task = serializeMobileTask({ id: "1", name: "x" });
  assert.equal(task.type, "task");
});

test("serializeMobileTask preserves a valid stored type", () => {
  const task = serializeMobileTask({ id: "1", name: "x", type: "feature" });
  assert.equal(task.type, "feature");
});

test("serializeMobileTask falls back to 'task' for an unexpected stored value", () => {
  const task = serializeMobileTask({ id: "1", name: "x", type: "not-a-real-type" });
  assert.equal(task.type, "task");
});
