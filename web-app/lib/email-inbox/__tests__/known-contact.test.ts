import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildKnownContactConditions,
  buildKnownContactRulePayload,
  normalizeKnownContactEmail,
} from "../known-contact";

test("normalizeKnownContactEmail lowercases and trims", () => {
  assert.equal(normalizeKnownContactEmail("  John@Example.COM "), "john@example.com");
  assert.equal(normalizeKnownContactEmail(""), "");
});

test("buildKnownContactConditions is an exact sender_email match", () => {
  const conditions = buildKnownContactConditions("John@Example.com");
  assert.deepEqual(conditions, [
    { field: "sender_email", operator: "equals", value: "john@example.com" },
  ]);
});

test("buildKnownContactRulePayload is a deterministic user-scoped never_spam rule", () => {
  const payload = buildKnownContactRulePayload({
    userId: "user-1",
    senderEmail: "John@Example.com",
    senderName: "John Clemens",
  });

  // User-scoped (applies across every mailbox), deterministic source.
  assert.equal(payload.userId, "user-1");
  assert.equal(payload.mailboxId, null);
  assert.equal(payload.source, "known_contact");
  assert.equal(payload.isActive, true);
  assert.equal(payload.matchMode, "all");
  assert.equal(payload.stopProcessing, false);

  // The action is the same override the spam pipeline honors before AI runs.
  assert.deepEqual(payload.actions, [{ type: "never_spam" }]);

  // Condition matches the normalized sender address exactly.
  assert.deepEqual(payload.conditions, [
    { field: "sender_email", operator: "equals", value: "john@example.com" },
  ]);

  // Name is surfaced in the description but the rule name keys off the email.
  assert.equal(payload.name, "Known contact: john@example.com");
  assert.match(payload.description, /John Clemens/);
  assert.match(payload.description, /never marked as spam/i);
});

test("buildKnownContactRulePayload produces identical rules for button and auto-detection", () => {
  const fromButton = buildKnownContactRulePayload({
    userId: "u",
    senderEmail: "a@b.com",
    senderName: "A B",
  });
  const fromHistory = buildKnownContactRulePayload({
    userId: "u",
    senderEmail: "A@B.com",
  });

  // Same sender → same conditions + actions, so idempotent matching dedupes them.
  assert.deepEqual(fromButton.conditions, fromHistory.conditions);
  assert.deepEqual(fromButton.actions, fromHistory.actions);
  assert.equal(fromButton.name, fromHistory.name);
});
