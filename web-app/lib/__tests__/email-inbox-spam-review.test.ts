/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSpamReviewSessionItems,
  listDetectedSpamItems,
  shouldConfirmSpamRuleUndo,
  summarizeEmailRuleConditions,
  upsertCreatedSpamReviewRule,
} from "../email-inbox/spam-review";

const spamItem = {
  id: "thread-1",
  mailboxId: "mailbox-1",
  mailboxName: "Ops",
  status: "quarantine",
  classification: "spam",
  resolutionState: "open",
  actionTitle: "Review suspicious email",
  subject: "Limited time offer",
  needsProject: false,
  alwaysDelete: false,
  derivedTaskCount: 0,
  createdAt: "2026-04-03T00:00:00.000Z",
  updatedAt: "2026-04-03T00:00:00.000Z",
} as any;

test("listDetectedSpamItems respects the mailbox filter", () => {
  const items = [
    spamItem,
    {
      ...spamItem,
      id: "thread-2",
      mailboxId: "mailbox-2",
      createdAt: "2026-04-04T00:00:00.000Z",
      updatedAt: "2026-04-04T00:00:00.000Z",
    },
    {
      ...spamItem,
      id: "thread-3",
      classification: "reference",
    },
  ];

  assert.deepEqual(
    listDetectedSpamItems(items, "mailbox-1").map((item) => item.id),
    ["thread-1"],
  );
  assert.deepEqual(
    listDetectedSpamItems(items).map((item) => item.id),
    ["thread-2", "thread-1"],
  );
});

test("buildSpamReviewSessionItems defaults every detected spam toggle to on", () => {
  const session = buildSpamReviewSessionItems([spamItem]);

  assert.equal(session.length, 1);
  assert.equal(session[0]?.keepSpam, true);
});

test("upsertCreatedSpamReviewRule keeps only the latest rule per thread", () => {
  const rule = {
    id: "rule-1",
    name: "Never spam trusted@example.com",
    source: "user",
    isActive: true,
    priority: 1,
    matchMode: "all",
    conditions: [],
    actions: [{ type: "never_spam" }],
    stopProcessing: false,
    createdAt: "",
    updatedAt: "",
  } as any;

  const updated = upsertCreatedSpamReviewRule(
    [
      {
        threadId: "thread-1",
        rule,
        rationale: "Old rationale",
      },
    ],
    {
      threadId: "thread-1",
      rule: { ...rule, id: "rule-2" },
      rationale: "New rationale",
    },
  );

  assert.equal(updated.length, 1);
  assert.equal(updated[0]?.rule.id, "rule-2");
  assert.equal(updated[0]?.rationale, "New rationale");
});

test("shouldConfirmSpamRuleUndo requires a created rule when turning spam back on", () => {
  assert.equal(
    shouldConfirmSpamRuleUndo({
      createdRuleId: "rule-1",
      nextKeepSpam: true,
    }),
    true,
  );
  assert.equal(
    shouldConfirmSpamRuleUndo({
      createdRuleId: null,
      nextKeepSpam: true,
    }),
    false,
  );
});

test("summarizeEmailRuleConditions renders readable condition text", () => {
  assert.equal(
    summarizeEmailRuleConditions({
      matchMode: "all",
      conditions: [
        {
          field: "sender_email",
          operator: "equals",
          value: "trusted@example.com",
        },
      ],
    } as any),
    'Sender email equals "trusted@example.com"',
  );
});
