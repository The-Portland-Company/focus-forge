/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  aiIntentKey,
  isUnfiledInboxItem,
  listUnresolvedAiIntents,
} from "../email-inbox/inbox-tabs";
import type { InboxItem, InboxParticipant } from "../types";

const TABS = [
  {
    id: "tab-transactional",
    rules: {
      matchMode: "any" as const,
      conditions: [
        {
          field: "sender_email" as const,
          operator: "equals" as const,
          value: "support@npmjs.com",
        },
      ],
    },
  },
];

const from = (emailAddress: string): InboxParticipant[] => [
  {
    id: "participant-1",
    emailAddress,
    displayName: null,
    participantRole: "from",
  },
];

const item = (overrides: Partial<InboxItem> = {}): InboxItem =>
  ({
    id: "thread-1",
    subject: "Successfully published @the-portland-company/shell@0.39.0",
    participants: from("support@npmjs.com"),
    ...overrides,
  }) as InboxItem;

test("a thread matching a tab's rules is filed — it does not belong in All", () => {
  assert.equal(isUnfiledInboxItem(item(), TABS), false);
});

test("a thread explicitly moved onto a tab is filed even if no rule matches it", () => {
  const moved = item({
    inboxTabId: "tab-receipts",
    participants: from("someone@example.com"),
  });
  assert.equal(isUnfiledInboxItem(moved, TABS), false);
});

test("a thread matching no tab and assigned to none belongs in All", () => {
  const unfiled = item({
    subject: "[Supabase] Action Required: Payment Failure",
    participants: from("billing@spoofed.example"),
  });
  assert.equal(isUnfiledInboxItem(unfiled, TABS), true);
});

test("tabs with empty rules file nothing", () => {
  const emptyTabs = [
    { id: "tab-known", rules: { matchMode: "any" as const, conditions: [] } },
  ];
  assert.equal(isUnfiledInboxItem(item(), emptyTabs), true);
});

test("aiIntentKey normalizes whitespace, case and length so client and server agree", () => {
  assert.equal(aiIntentKey("  About   A Client   INVOICE "), "about a client invoice");
  assert.equal(aiIntentKey("x".repeat(500)).length, 200);
});

test("an ai_intent condition matches only on a cached true verdict", () => {
  const aiTabs = [
    {
      id: "tab-invoices",
      rules: {
        matchMode: "any" as const,
        conditions: [
          {
            field: "ai_intent" as const,
            operator: "matches" as const,
            value: "The email is about a client Invoice",
          },
        ],
      },
    },
  ];
  const key = aiIntentKey("The email is about a client Invoice");

  const undecided = item();
  assert.equal(isUnfiledInboxItem(undecided, aiTabs), true);

  const yes = item({ aiTabVerdicts: { [key]: true } });
  assert.equal(isUnfiledInboxItem(yes, aiTabs), false);

  const no = item({ aiTabVerdicts: { [key]: false } });
  assert.equal(isUnfiledInboxItem(no, aiTabs), true);
});

test("listUnresolvedAiIntents returns only pairs with no cached verdict", () => {
  const aiTabs = [
    {
      rules: {
        matchMode: "any" as const,
        conditions: [
          { field: "ai_intent" as const, operator: "matches" as const, value: "is an invoice" },
          { field: "subject" as const, operator: "contains" as const, value: "receipt" },
        ],
      },
    },
  ];
  const decided = { ...item({ aiTabVerdicts: { "is an invoice": false } }), id: "decided" };
  const pending = { ...item(), id: "pending" };

  assert.deepEqual(listUnresolvedAiIntents([decided, pending], aiTabs), [
    { threadId: "pending", prompt: "is an invoice" },
  ]);
});

test("listUnresolvedAiIntents is empty when no tab uses an AI condition", () => {
  assert.deepEqual(listUnresolvedAiIntents([item()], TABS), []);
});
