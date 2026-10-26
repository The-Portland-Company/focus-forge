/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateEmailRules } from "../triage/evaluate";
import { computeRuleFingerprint } from "../triage/fingerprint";
import { orderRulesForEvaluation } from "../triage/order";
import type { EmailRule } from "@/lib/types";
import type { EmailRuleContext } from "../rules";

function rule(partial: Partial<EmailRule>): EmailRule {
  return {
    id: partial.id || "r",
    name: partial.name || "rule",
    source: "user",
    isActive: partial.isActive ?? true,
    priority: partial.priority ?? 100,
    matchMode: partial.matchMode || "all",
    conditions: partial.conditions || [],
    actions: partial.actions || [],
    stopProcessing: partial.stopProcessing ?? false,
    mailboxId: partial.mailboxId ?? null,
    organizationId: partial.organizationId ?? null,
    userId: partial.userId ?? null,
    createdAt: partial.createdAt || "2026-01-01T00:00:00.000Z",
    updatedAt: partial.updatedAt || "2026-01-01T00:00:00.000Z",
  };
}

const ctx: EmailRuleContext = {
  senderEmail: "promo@shady.example",
  senderDomain: "shady.example",
  subject: "You won a prize",
  body: "Click here",
  mailbox: "me@work.com",
  participants: ["promo@shady.example", "me@work.com"],
};

test("a spam rule is terminal and sets quarantine + spam", () => {
  const v = evaluateEmailRules(
    [
      rule({
        id: "spam-rule",
        conditions: [
          { field: "sender_domain", operator: "equals", value: "shady.example" },
        ],
        actions: [{ type: "spam" }],
      }),
    ],
    ctx,
  );
  assert.equal(v.terminal, true);
  assert.equal(v.status, "quarantine");
  assert.equal(v.classification, "spam");
  assert.equal(v.winningRuleId, "spam-rule");
});

test("never_spam suppresses a later spam rule and is non-terminal", () => {
  const v = evaluateEmailRules(
    [
      rule({
        id: "spam-rule",
        priority: 10,
        conditions: [
          { field: "sender_domain", operator: "equals", value: "shady.example" },
        ],
        actions: [{ type: "spam" }],
      }),
      rule({
        id: "trust-rule",
        priority: 50,
        conditions: [
          {
            field: "sender_email",
            operator: "equals",
            value: "promo@shady.example",
          },
        ],
        actions: [{ type: "never_spam" }],
      }),
    ],
    ctx,
  );
  // Protective rule sorts first, so spam is suppressed and never terminates.
  assert.equal(v.preventSpamClassification, true);
  assert.equal(v.status, null);
  assert.notEqual(v.classification, "spam");
  assert.equal(v.terminal, false);
});

test("skip_ai is terminal without changing status/classification", () => {
  const v = evaluateEmailRules(
    [
      rule({
        id: "skip",
        conditions: [{ field: "subject", operator: "contains", value: "prize" }],
        actions: [{ type: "skip_ai" }],
      }),
    ],
    ctx,
  );
  assert.equal(v.terminal, true);
  assert.equal(v.skipAi, true);
  assert.equal(v.status, null);
});

test("set_classification and set_inbox_tab are non-terminal and applied", () => {
  const v = evaluateEmailRules(
    [
      rule({
        id: "tab",
        conditions: [{ field: "subject", operator: "contains", value: "prize" }],
        actions: [
          { type: "set_classification", value: "newsletter" },
          { type: "set_inbox_tab", value: "tab-123" },
        ],
      }),
    ],
    ctx,
  );
  assert.equal(v.terminal, false);
  assert.equal(v.classification, "newsletter");
  assert.equal(v.inboxTabId, "tab-123");
});

test("set_classification rejects a value outside the enum", () => {
  const v = evaluateEmailRules(
    [
      rule({
        id: "bad",
        conditions: [{ field: "subject", operator: "contains", value: "prize" }],
        actions: [{ type: "set_classification", value: "garbage" }],
      }),
    ],
    ctx,
  );
  assert.equal(v.classification, null);
});

test("no matches yields an empty verdict", () => {
  const v = evaluateEmailRules(
    [
      rule({
        id: "nope",
        conditions: [
          { field: "sender_domain", operator: "equals", value: "other.com" },
        ],
        actions: [{ type: "spam" }],
      }),
    ],
    ctx,
  );
  assert.equal(v.matchedRuleIds.length, 0);
  assert.equal(v.terminal, false);
  assert.equal(v.winningRuleId, null);
});

test("ordering puts protective rules first, then priority", () => {
  const ordered = orderRulesForEvaluation([
    rule({ id: "low", priority: 10, actions: [{ type: "spam" }] }),
    rule({ id: "trust", priority: 99, actions: [{ type: "never_spam" }] }),
    rule({ id: "high", priority: 5, actions: [{ type: "archive" }] }),
  ]);
  assert.equal(ordered[0].id, "trust");
  assert.equal(ordered[1].id, "high");
  assert.equal(ordered[2].id, "low");
});

test("fingerprint is order-independent over conditions and actions", () => {
  const a = computeRuleFingerprint({
    userId: "u1",
    matchMode: "all",
    conditions: [
      { field: "subject", operator: "contains", value: "OTP" },
      { field: "sender_domain", operator: "equals", value: "Bank.com" },
    ],
    actions: [{ type: "set_inbox_tab", value: "t1" }, { type: "mark_read" }],
  });
  const b = computeRuleFingerprint({
    userId: "u1",
    matchMode: "all",
    conditions: [
      { field: "sender_domain", operator: "equals", value: "bank.com" },
      { field: "subject", operator: "contains", value: "otp" },
    ],
    actions: [{ type: "mark_read" }, { type: "set_inbox_tab", value: "t1" }],
  });
  assert.equal(a, b);
});

test("fingerprint distinguishes scope", () => {
  const base = {
    matchMode: "all" as const,
    conditions: [{ field: "sender_domain" as const, operator: "equals" as const, value: "bank.com" }],
    actions: [{ type: "never_spam" as const }],
  };
  assert.notEqual(
    computeRuleFingerprint({ ...base, userId: "u1" }),
    computeRuleFingerprint({ ...base, mailboxId: "m1" }),
  );
});
