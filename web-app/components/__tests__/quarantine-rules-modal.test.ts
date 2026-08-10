/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { ruleValueForField } from "@/components/quarantine-rules-modal";
import type { InboxItem } from "@/lib/types";

const ITEM = {
  id: "thread-1",
  subject: "Beyond email + SMS",
  previewText: "Hi Spencer, quick note about your plans.",
  summaryText: "A sales pitch.",
  participants: [
    {
      emailAddress: "Agency@ThePortlandCompany.com",
      participantRole: "from",
    },
    { emailAddress: "sp@example.com", participantRole: "to" },
  ],
} as unknown as InboxItem;

test("each field takes its value from the matching part of the email", () => {
  assert.equal(
    ruleValueForField(ITEM, "sender_email"),
    "agency@theportlandcompany.com",
  );
  assert.equal(
    ruleValueForField(ITEM, "sender_domain"),
    "theportlandcompany.com",
  );
  assert.equal(ruleValueForField(ITEM, "subject"), "Beyond email + SMS");
  assert.equal(
    ruleValueForField(ITEM, "body"),
    "Hi Spencer, quick note about your plans.",
  );
});

test("body falls back to the summary when there is no preview", () => {
  const item = { ...ITEM, previewText: null } as unknown as InboxItem;
  assert.equal(ruleValueForField(item, "body"), "A sales pitch.");
});

test("a missing sender yields empty values rather than a broken rule", () => {
  const item = { ...ITEM, participants: [] } as unknown as InboxItem;
  assert.equal(ruleValueForField(item, "sender_email"), "");
  assert.equal(ruleValueForField(item, "sender_domain"), "");
});
