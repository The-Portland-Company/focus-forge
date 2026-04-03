/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFallbackSpamExceptionRuleDraft,
  buildSpamExceptionRevertPayload,
  buildSpamExceptionRulePayload,
} from "../email-inbox/spam-exception";

test("buildFallbackSpamExceptionRuleDraft creates a mailbox-scoped sender rule", () => {
  const draft = buildFallbackSpamExceptionRuleDraft({
    senderEmail: "trusted@example.com",
    senderName: "Trusted Sender",
    subject: "Project kickoff",
    bodyText: "Sharing the updated kickoff notes.",
    mailboxId: "mailbox-1",
    mailboxEmail: "team@example.com",
    mailboxName: "Team Inbox",
    participantEmails: ["trusted@example.com"],
    summaryText: "Legitimate project update.",
    reason: "This sender is part of an active project conversation.",
  });

  assert.equal(draft.mailboxScope, "mailbox");
  assert.equal(draft.conditions[0]?.field, "sender_email");
  assert.equal(draft.conditions[0]?.operator, "equals");
  assert.equal(draft.conditions[0]?.value, "trusted@example.com");
  assert.match(draft.rationale, /active project conversation/i);
});

test("buildSpamExceptionRulePayload produces an active never_spam rule", () => {
  const payload = buildSpamExceptionRulePayload({
    userId: "user-1",
    mailboxId: "mailbox-1",
    draft: {
      name: "Never spam trusted@example.com",
      description: "Allow this sender.",
      mailboxScope: "mailbox",
      rationale: "Trusted sender.",
      conditions: [
        {
          field: "sender_email",
          operator: "equals",
          value: "trusted@example.com",
        },
      ],
    },
  });

  assert.equal(payload.userId, "user-1");
  assert.equal(payload.mailboxId, "mailbox-1");
  assert.equal(payload.isActive, true);
  assert.deepEqual(payload.actions, [{ type: "never_spam" }]);
  assert.equal(payload.stopProcessing, false);
});

test("buildSpamExceptionRevertPayload deactivates the created rule", () => {
  assert.deepEqual(buildSpamExceptionRevertPayload(), {
    isActive: false,
  });
});
