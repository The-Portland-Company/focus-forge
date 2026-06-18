import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampMinutes,
  normalizeTags,
  normalizeOptionalText,
  normalizePriority,
  validateExamplePayload,
} from "../ai-estimator/example-payload";

test("clampMinutes clamps to 1–480 and rounds; null on non-numeric", () => {
  assert.equal(clampMinutes(30), 30);
  assert.equal(clampMinutes(0), 1);
  assert.equal(clampMinutes(999), 480);
  assert.equal(clampMinutes(12.6), 13);
  assert.equal(clampMinutes("45"), 45);
  assert.equal(clampMinutes("abc"), null);
  assert.equal(clampMinutes(null), null);
});

test("normalizeTags trims, drops empties, caps at 16", () => {
  assert.deepEqual(normalizeTags(["  a ", "", "b", 3]), ["a", "b"]);
  assert.deepEqual(normalizeTags("nope"), []);
  assert.equal(normalizeTags(Array.from({ length: 20 }, (_, i) => `t${i}`)).length, 16);
});

test("normalizeOptionalText trims; empty/non-string -> null", () => {
  assert.equal(normalizeOptionalText("  hi "), "hi");
  assert.equal(normalizeOptionalText("   "), null);
  assert.equal(normalizeOptionalText(42), null);
});

test("normalizePriority handles blanks and ints", () => {
  assert.equal(normalizePriority(""), null);
  assert.equal(normalizePriority(null), null);
  assert.equal(normalizePriority("2"), 2);
  assert.equal(normalizePriority(3.9), 3);
  assert.equal(normalizePriority(0), null);
});

test("validateExamplePayload accepts a valid POST body", () => {
  const res = validateExamplePayload({
    taskName: "  Draft email ",
    acceptedMinutes: "45",
    projectName: " Marketing ",
    taskDescription: "  ",
    tags: ["x"],
    priority: "1",
  });
  assert.ok("value" in res);
  if ("value" in res) {
    assert.equal(res.value.taskName, "Draft email");
    assert.equal(res.value.acceptedMinutes, 45);
    assert.equal(res.value.projectName, "Marketing");
    assert.equal(res.value.taskDescription, null);
    assert.deepEqual(res.value.tags, ["x"]);
    assert.equal(res.value.priority, 1);
  }
});

test("validateExamplePayload rejects missing name and bad minutes", () => {
  assert.ok("error" in validateExamplePayload({ acceptedMinutes: 30 }));
  assert.ok("error" in validateExamplePayload({ taskName: "x", acceptedMinutes: "nope" }));
  assert.ok("error" in validateExamplePayload(null));
});
