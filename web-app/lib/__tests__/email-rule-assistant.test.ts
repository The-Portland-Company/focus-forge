/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEmailRuleAssistantFallback,
  buildRuleAssistantUserMessage,
  sanitizeEmailRuleAssistantDraft,
} from "../email-inbox/rule-assistant";

test("buildEmailRuleAssistantFallback creates a valid starter rule", () => {
  const draft = buildEmailRuleAssistantFallback({
    prompt: "Archive receipts from Stripe and mark them read.",
    mailboxId: "mailbox-1",
  });

  assert.equal(draft.mailboxScope, "mailbox");
  assert.equal(draft.actions[0]?.type, "quarantine");
  assert.equal(draft.conditions[0]?.field, "subject");
});

test("sanitizeEmailRuleAssistantDraft removes unsupported fields and actions", () => {
  const fallback = buildEmailRuleAssistantFallback({
    prompt: "test prompt",
  });

  const draft = sanitizeEmailRuleAssistantDraft(
    {
      name: "  Rule name  ",
      description: "  Rule description  ",
      mailboxScope: "user",
      priority: 0,
      matchMode: "any",
      stopProcessing: false,
      rationale: "  Keep this concise  ",
      assistantMessage: "  Generated safely  ",
      conditions: [
        {
          field: "subject",
          operator: "contains",
          value: "invoice",
        },
        {
          field: "unsupported_field",
          operator: "contains",
          value: "bad",
        },
      ] as any,
      actions: [
        { type: "archive" },
        { type: "unsupported_action" },
      ] as any,
    },
    fallback,
  );

  assert.equal(draft.name, "Rule name");
  assert.equal(draft.mailboxScope, "user");
  assert.equal(draft.priority, 1);
  assert.equal(draft.matchMode, "any");
  assert.equal(draft.stopProcessing, false);
  assert.deepEqual(draft.conditions, [
    {
      field: "subject",
      operator: "contains",
      value: "invoice",
    },
  ]);
  assert.deepEqual(draft.actions, [{ type: "archive" }]);
});

test("buildRuleAssistantUserMessage shows existing rules + group keys and the merge directive", () => {
  const fallback = buildEmailRuleAssistantFallback({
    prompt: "Route OTP codes to a tab",
    mailboxId: "m1",
  });
  const msg = buildRuleAssistantUserMessage(
    {
      prompt: "Route OTP codes to a tab",
      mailboxes: [],
      mailboxId: "m1",
      existingRules: [
        {
          id: "otp",
          name: "OTP codes",
          groupKey: "otp",
          matchMode: "any",
          conditions: [{ field: "subject", operator: "contains", value: "code" }],
          actions: [{ type: "set_inbox_tab" }],
        },
      ],
    },
    fallback,
  );
  assert.match(msg, /existingRules/);
  assert.match(msg, /"groupKey":"otp"/);
  assert.match(msg, /prefer extending a value family/);
});
