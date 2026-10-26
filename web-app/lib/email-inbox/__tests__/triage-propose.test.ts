/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateProposal,
  conditionsSubsumedBy,
  RULE_HARD_CAP,
  RULE_SOFT_WARN_COUNT,
  type RuleCandidate,
} from "../triage/propose";
import { computeRuleFingerprint } from "../triage/fingerprint";
import type { EmailRule } from "@/lib/types";

function rule(partial: Partial<EmailRule>): EmailRule {
  const r: EmailRule = {
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
    userId: partial.userId ?? "u1",
    groupKey: partial.groupKey ?? null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  r.fingerprint =
    partial.fingerprint ??
    computeRuleFingerprint({
      mailboxId: r.mailboxId,
      organizationId: r.organizationId,
      userId: r.userId,
      matchMode: r.matchMode,
      conditions: r.conditions,
      actions: r.actions,
    });
  return r;
}

const candidate = (partial: Partial<RuleCandidate>): RuleCandidate => ({
  name: partial.name || "cand",
  userId: "u1",
  matchMode: partial.matchMode || "all",
  conditions: partial.conditions || [],
  actions: partial.actions || [],
  groupKey: partial.groupKey ?? null,
  generatedBy: partial.generatedBy ?? "ai",
  mailboxId: partial.mailboxId ?? null,
  organizationId: partial.organizationId ?? null,
});

test("exact duplicate → duplicate_of", () => {
  const existing = rule({
    id: "e1",
    conditions: [{ field: "sender_domain", operator: "equals", value: "x.com" }],
    actions: [{ type: "never_spam" }],
  });
  const d = evaluateProposal(
    candidate({
      conditions: [
        { field: "sender_domain", operator: "equals", value: "X.com" },
      ],
      actions: [{ type: "never_spam" }],
    }),
    [existing],
  );
  assert.equal(d.outcome, "duplicate_of");
  assert.equal(d.targetRuleId, "e1");
});

test("subsumption: sender_email covered by a sender_domain rule → covered_by", () => {
  const existing = rule({
    id: "dom",
    conditions: [{ field: "sender_domain", operator: "equals", value: "x.com" }],
    actions: [{ type: "never_spam" }],
  });
  const d = evaluateProposal(
    candidate({
      conditions: [
        { field: "sender_email", operator: "equals", value: "a@x.com" },
      ],
      actions: [{ type: "never_spam" }],
    }),
    [existing],
  );
  assert.equal(d.outcome, "covered_by");
  assert.equal(d.targetRuleId, "dom");
});

test("subsumption requires the same action set", () => {
  const existing = rule({
    id: "dom",
    conditions: [{ field: "sender_domain", operator: "equals", value: "x.com" }],
    actions: [{ type: "archive" }],
  });
  const d = evaluateProposal(
    candidate({
      conditions: [
        { field: "sender_email", operator: "equals", value: "a@x.com" },
      ],
      actions: [{ type: "never_spam" }],
    }),
    [existing],
  );
  assert.equal(d.outcome, "create");
});

test("group-merge: a value family with headroom → merge_into", () => {
  const family = rule({
    id: "otp",
    groupKey: "otp",
    matchMode: "any",
    conditions: [
      { field: "subject", operator: "contains", value: "code" },
      { field: "subject", operator: "contains", value: "otp" },
    ],
    actions: [{ type: "set_inbox_tab", value: "t-otp" }],
  });
  const d = evaluateProposal(
    candidate({
      groupKey: "otp",
      conditions: [
        { field: "subject", operator: "contains", value: "verification" },
      ],
      actions: [{ type: "set_inbox_tab", value: "t-otp" }],
    }),
    [family],
  );
  assert.equal(d.outcome, "merge_into");
  assert.equal(d.targetRuleId, "otp");
  assert.equal(d.mergeValue, "verification");
  assert.equal(d.mergeField, "subject");
});

test("group-merge refuses a full family (≥10 values) → create", () => {
  const conditions = Array.from({ length: 10 }, (_, i) => ({
    field: "subject" as const,
    operator: "contains" as const,
    value: `v${i}`,
  }));
  const family = rule({
    id: "big",
    groupKey: "otp",
    matchMode: "any",
    conditions,
    actions: [{ type: "set_inbox_tab", value: "t-otp" }],
  });
  const d = evaluateProposal(
    candidate({
      groupKey: "otp",
      conditions: [{ field: "subject", operator: "contains", value: "new" }],
      actions: [{ type: "set_inbox_tab", value: "t-otp" }],
    }),
    [family],
  );
  assert.equal(d.outcome, "create");
});

test("cap: soft warning at the soft threshold, hard-cap flag at the ceiling", () => {
  const many = Array.from({ length: RULE_SOFT_WARN_COUNT }, (_, i) =>
    rule({
      id: `r${i}`,
      conditions: [
        { field: "subject", operator: "contains", value: `topic-${i}` },
      ],
      actions: [{ type: "archive" }],
    }),
  );
  const warn = evaluateProposal(
    candidate({
      conditions: [{ field: "subject", operator: "contains", value: "fresh" }],
      actions: [{ type: "archive" }],
    }),
    many,
  );
  assert.equal(warn.capWarning, true);
  assert.equal(warn.capExceeded, false);

  const atCap = Array.from({ length: RULE_HARD_CAP }, (_, i) =>
    rule({
      id: `c${i}`,
      conditions: [{ field: "subject", operator: "contains", value: `t-${i}` }],
      actions: [{ type: "archive" }],
    }),
  );
  const exceeded = evaluateProposal(
    candidate({
      conditions: [{ field: "subject", operator: "contains", value: "fresh2" }],
      actions: [{ type: "archive" }],
    }),
    atCap,
  );
  assert.equal(exceeded.capExceeded, true);
});

test("conditionsSubsumedBy ignores 'any' existing rules (weaker than they look)", () => {
  const anyRule = rule({
    matchMode: "any",
    conditions: [{ field: "sender_domain", operator: "equals", value: "x.com" }],
    actions: [{ type: "never_spam" }],
  });
  assert.equal(
    conditionsSubsumedBy(
      [{ field: "sender_email", operator: "equals", value: "a@x.com" }],
      anyRule,
    ),
    false,
  );
});
