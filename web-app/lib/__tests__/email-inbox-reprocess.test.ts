/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  applySpamKnnOverride,
  resolveRuleDrivenThreadState,
  isContentSpamExemptSender,
} from "../email-inbox/reprocess";

test("isContentSpamExemptSender exempts theportlandcompany.com senders", () => {
  assert.equal(
    isContentSpamExemptSender("nueraheat@theportlandcompany.com"),
    true,
  );
  assert.equal(
    isContentSpamExemptSender("styleaesthetics@THEPORTLANDCOMPANY.COM"),
    true,
  );
  assert.equal(
    isContentSpamExemptSender("bot@mail.theportlandcompany.com"),
    true,
  );
  assert.equal(isContentSpamExemptSender("someone@gmail.com"), false);
  assert.equal(
    isContentSpamExemptSender("evil@nottheportlandcompany.com"),
    false,
  );
  assert.equal(isContentSpamExemptSender(""), false);
  assert.equal(isContentSpamExemptSender(null), false);
});

// resolveRuleDrivenThreadState is intentionally NOT gated on the domain
// exemption: explicit user "spam" rules must still route exempt-domain mail.
test("resolveRuleDrivenThreadState still applies explicit spam rules", () => {
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
    ruleActions: new Set(["spam"]),
  });

  assert.equal(result.classification, "spam");
  assert.equal(result.status, "quarantine");
});

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

// Regression: a not_spam-skewed k-NN corpus was confidently un-flagging real
// spam by downgrading the LLM's correct "spam" verdict back to actionable.
test("applySpamKnnOverride never downgrades a confident LLM spam verdict", () => {
  const result = applySpamKnnOverride({
    classification: "spam",
    status: "quarantine",
    needsProject: false,
    knnLabel: "not_spam",
    knnConfident: true,
    suppressContentSpam: false,
  });

  assert.equal(result.classification, "spam");
  assert.equal(result.status, "quarantine");
  assert.equal(result.needsProject, false);
});

test("applySpamKnnOverride still upgrades to spam on a confident spam verdict", () => {
  const result = applySpamKnnOverride({
    classification: "actionable",
    status: "active",
    needsProject: false,
    knnLabel: "spam",
    knnConfident: true,
    suppressContentSpam: false,
  });

  assert.equal(result.classification, "spam");
  assert.equal(result.status, "quarantine");
});

test("applySpamKnnOverride leaves state alone without a confident verdict", () => {
  const result = applySpamKnnOverride({
    classification: "actionable",
    status: "active",
    needsProject: true,
    knnLabel: "spam",
    knnConfident: false,
    suppressContentSpam: false,
  });

  assert.equal(result.classification, "actionable");
  assert.equal(result.status, "active");
  assert.equal(result.needsProject, true);
});

test("applySpamKnnOverride is skipped when content spam is suppressed", () => {
  const result = applySpamKnnOverride({
    classification: "actionable",
    status: "active",
    needsProject: false,
    knnLabel: "spam",
    knnConfident: true,
    suppressContentSpam: true,
  });

  assert.equal(result.classification, "actionable");
  assert.equal(result.status, "active");
});
