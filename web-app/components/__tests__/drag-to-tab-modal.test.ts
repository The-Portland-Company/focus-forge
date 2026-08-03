/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { mergeTabConditions } from "../drag-to-tab-modal";
import {
  defaultOperatorForField,
  deriveTabConditionValueForField,
  type InboxTabCondition,
} from "@/lib/email-inbox/inbox-tabs";
import type { InboxItem } from "@/lib/types";

const cond = (
  field: InboxTabCondition["field"],
  operator: InboxTabCondition["operator"],
  value: string,
): InboxTabCondition => ({ field, operator, value });

test("mergeTabConditions appends every new condition to the tab's existing ones", () => {
  const merged = mergeTabConditions(
    [cond("subject", "contains", "receipt")],
    [
      cond("sender_email", "equals", "agency@theportlandcompany.com"),
      cond("sender_domain", "contains", "stripe.com"),
    ],
  );

  assert.deepEqual(merged, [
    cond("subject", "contains", "receipt"),
    cond("sender_email", "equals", "agency@theportlandcompany.com"),
    cond("sender_domain", "contains", "stripe.com"),
  ]);
});

test("mergeTabConditions trims values and skips duplicates (existing and within the batch)", () => {
  const merged = mergeTabConditions(
    [cond("sender_email", "equals", "agency@theportlandcompany.com")],
    [
      cond("sender_email", "equals", "  AGENCY@theportlandcompany.com  "),
      cond("sender_domain", "contains", " stripe.com "),
      cond("sender_domain", "contains", "stripe.com"),
    ],
  );

  assert.deepEqual(merged, [
    cond("sender_email", "equals", "agency@theportlandcompany.com"),
    cond("sender_domain", "contains", "stripe.com"),
  ]);
});

test("deriveTabConditionValueForField fills the value from the email being filed", () => {
  const item = {
    subject: "  Domain Auto Renewal Reminders  ",
    previewText: "Your domain renews soon",
    classification: "transactional",
    participants: [
      {
        participantRole: "from",
        emailAddress: "Billing@Cloudflare.com",
      },
    ],
  } as unknown as InboxItem;

  assert.equal(
    deriveTabConditionValueForField(item, "sender_email"),
    "billing@cloudflare.com",
  );
  assert.equal(
    deriveTabConditionValueForField(item, "sender_domain"),
    "cloudflare.com",
  );
  assert.equal(
    deriveTabConditionValueForField(item, "subject"),
    "Domain Auto Renewal Reminders",
  );
  assert.equal(
    deriveTabConditionValueForField(item, "preview"),
    "Your domain renews soon",
  );
  assert.equal(
    deriveTabConditionValueForField(item, "classification"),
    "transactional",
  );
  // No sensible per-email value for these two, so they stay blank.
  assert.equal(deriveTabConditionValueForField(item, "ai_intent"), "");
  assert.equal(deriveTabConditionValueForField(item, "known_contact"), "");
});

test("deriveTabConditionValueForField falls back to the summary when there is no preview", () => {
  const item = {
    subject: "",
    summaryText: "Summary stands in for the preview",
    participants: [],
  } as unknown as InboxItem;

  assert.equal(
    deriveTabConditionValueForField(item, "preview"),
    "Summary stands in for the preview",
  );
  assert.equal(deriveTabConditionValueForField(item, "sender_domain"), "");
});

test("defaultOperatorForField uses exact match for canonical fields, contains for free text", () => {
  assert.equal(defaultOperatorForField("sender_email"), "equals");
  assert.equal(defaultOperatorForField("sender_domain"), "equals");
  assert.equal(defaultOperatorForField("classification"), "equals");
  assert.equal(defaultOperatorForField("subject"), "contains");
  assert.equal(defaultOperatorForField("preview"), "contains");
});
