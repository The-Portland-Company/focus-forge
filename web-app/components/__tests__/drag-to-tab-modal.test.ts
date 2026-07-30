/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { mergeTabConditions } from "../drag-to-tab-modal";
import type { InboxTabCondition } from "@/lib/email-inbox/inbox-tabs";

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
