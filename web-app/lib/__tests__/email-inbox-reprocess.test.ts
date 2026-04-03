/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { resolveRuleDrivenThreadState } from "../email-inbox/reprocess";

test("resolveRuleDrivenThreadState lets never_spam override spam actions", () => {
  const result = resolveRuleDrivenThreadState({
    aiResult: {
      classification: "reference",
      status: "active",
      actionTitle: "Review context",
      summary: "Looks legitimate.",
      reason: "The message does not look like spam.",
      confidence: 0.66,
      needsProject: false,
      projectId: null,
      taskSuggestions: [],
    },
    ruleActions: new Set(["never_spam", "spam"]),
  });

  assert.equal(result.preventSpamClassification, true);
  assert.equal(result.classification, "reference");
  assert.equal(result.status, "active");
});

test("resolveRuleDrivenThreadState still honors explicit delete actions", () => {
  const result = resolveRuleDrivenThreadState({
    aiResult: {
      classification: "reference",
      status: "active",
      actionTitle: "Review context",
      summary: "Looks legitimate.",
      reason: "The message does not look like spam.",
      confidence: 0.66,
      needsProject: false,
      projectId: null,
      taskSuggestions: [],
    },
    ruleActions: new Set(["never_spam", "always_delete"]),
  });

  assert.equal(result.alwaysDelete, true);
  assert.equal(result.status, "deleted");
  assert.equal(result.classification, "spam");
});
