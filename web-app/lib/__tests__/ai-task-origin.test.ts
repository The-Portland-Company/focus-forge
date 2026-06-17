import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isAiCreatedTask,
  formatConfidence,
  classificationLabel,
  hasGenuineRationale,
} from "../email-inbox/ai-task-origin";

test("isAiCreatedTask only true for ai-generated links with a thread", () => {
  const map = {
    a: { threadId: "t1", generatedBy: "ai", rationale: "x" },
    b: { threadId: "t2", generatedBy: "user", rationale: null },
    c: { threadId: "t3", generatedBy: "rule", rationale: null },
    d: { threadId: "", generatedBy: "ai", rationale: null },
  };
  assert.equal(isAiCreatedTask("a", map), true);
  assert.equal(isAiCreatedTask("b", map), false);
  assert.equal(isAiCreatedTask("c", map), false);
  assert.equal(isAiCreatedTask("d", map), false);
  assert.equal(isAiCreatedTask("missing", map), false);
  assert.equal(isAiCreatedTask("a", undefined), false);
  assert.equal(isAiCreatedTask("a", null), false);
});

test("formatConfidence renders percent, omits zero/invalid", () => {
  assert.equal(formatConfidence(0.92), "92%");
  assert.equal(formatConfidence(1.5), "100%");
  assert.equal(formatConfidence(0), null);
  assert.equal(formatConfidence(null), null);
  assert.equal(formatConfidence(undefined), null);
  assert.equal(formatConfidence(NaN), null);
});

test("classificationLabel maps known values, passes through unknown", () => {
  assert.equal(classificationLabel("actionable"), "Actionable");
  assert.equal(classificationLabel("waiting"), "Waiting on reply");
  assert.equal(classificationLabel("weird"), "weird");
  assert.equal(classificationLabel(null), null);
  assert.equal(classificationLabel(undefined), null);
});

test("hasGenuineRationale requires non-empty reason text", () => {
  assert.equal(hasGenuineRationale({ reason: "Sender asked for X" }), true);
  assert.equal(hasGenuineRationale({ reason: "   " }), false);
  assert.equal(hasGenuineRationale({ reason: null }), false);
  assert.equal(hasGenuineRationale(null), false);
  assert.equal(hasGenuineRationale(undefined), false);
});
