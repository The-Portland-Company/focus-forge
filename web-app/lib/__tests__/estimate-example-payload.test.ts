/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  clampMinutes,
  normalizeTags,
  normalizeOptionalText,
  normalizePriority,
  validateExamplePayload,
} from "@/lib/ai-estimator/example-payload";

test("clampMinutes clamps to the 1–480 CHECK range and rounds", () => {
  assert.equal(clampMinutes(30), 30);
  assert.equal(clampMinutes(0), 1);
  assert.equal(clampMinutes(-5), 1);
  assert.equal(clampMinutes(1000), 480);
  assert.equal(clampMinutes(29.6), 30);
  assert.equal(clampMinutes("45"), 45);
});

test("clampMinutes returns null for non-numeric input", () => {
  assert.equal(clampMinutes("abc"), null);
  assert.equal(clampMinutes(null), null);
  assert.equal(clampMinutes(undefined), null);
  assert.equal(clampMinutes(NaN), null);
});

test("normalizeTags trims, drops empties, and caps at 16", () => {
  assert.deepEqual(normalizeTags([" a ", "", "b", 5]), ["a", "b"]);
  assert.deepEqual(normalizeTags("notarray"), []);
  assert.equal(normalizeTags(Array.from({ length: 30 }, () => "x")).length, 16);
});

test("normalizeOptionalText trims and maps empty to null", () => {
  assert.equal(normalizeOptionalText("  hi  "), "hi");
  assert.equal(normalizeOptionalText("   "), null);
  assert.equal(normalizeOptionalText(42), null);
});

test("normalizePriority coerces ints and maps blank/zero/invalid to null", () => {
  assert.equal(normalizePriority(2), 2);
  assert.equal(normalizePriority("3"), 3);
  assert.equal(normalizePriority(""), null);
  assert.equal(normalizePriority(null), null);
  assert.equal(normalizePriority(0), null);
  assert.equal(normalizePriority("abc"), null);
});

test("validateExamplePayload rejects bad bodies", () => {
  assert.deepEqual(validateExamplePayload(null), { error: "invalid body" });
  assert.deepEqual(validateExamplePayload("x"), { error: "invalid body" });
  assert.deepEqual(validateExamplePayload({ acceptedMinutes: 30 }), {
    error: "taskName required",
  });
  assert.deepEqual(
    validateExamplePayload({ taskName: "  " }),
    { error: "taskName required" },
  );
  assert.deepEqual(
    validateExamplePayload({ taskName: "Write email", acceptedMinutes: "nope" }),
    { error: "acceptedMinutes must be a number 1–480" },
  );
});

test("validateExamplePayload returns a normalized value for good input", () => {
  const result = validateExamplePayload({
    taskName: "  Draft outreach email  ",
    taskDescription: "  needs context  ",
    projectName: "  Marketing  ",
    tags: [" urgent ", ""],
    priority: "2",
    acceptedMinutes: 600,
  });
  assert.ok("value" in result);
  assert.deepEqual((result as { value: unknown }).value, {
    taskName: "Draft outreach email",
    taskDescription: "needs context",
    projectName: "Marketing",
    tags: ["urgent"],
    priority: 2,
    acceptedMinutes: 480,
  });
});
