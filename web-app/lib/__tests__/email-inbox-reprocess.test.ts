/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
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
