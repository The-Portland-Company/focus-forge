/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  applyOptimisticThreadActionState,
  EMAIL_INBOX_SORT_OPTIONS,
  applyOptimisticThreadReadState,
  buildEmailThreadPopoutUrl,
  clampEmailDetailPanelWidth,
  filterInboxItemsForView,
  filterReplyDraftsForView,
  getConversationEntryHeaderClassName,
  getDockBadgeDocumentTitle,
  getEmailInboxSplitClassName,
  getSpamScanProgressPercent,
  getThreadActionButtonClassName,
  getThreadActionButtonIconName,
  mergeInboxItem,
  normalizeDockBadgeCount,
  sortReplyDraftsForView,
  sortInboxItemsForView,
} from "../email-inbox-view";
import { formatEmailDeleteUndoDuration } from "../../lib/email-inbox/thread-actions";
import { createRuleFormFromRule } from "../email-rules-panel";
import {
  filterInboxProjects,
  sortInboxProjects,
} from "../../lib/email-thread-projects";

const projects = [
  {
    id: "project-3",
    name: "zebra launch",
    color: "#333333",
  },
  {
    id: "project-2",
    name: "Alpha Rollout",
    color: "#222222",
  },
  {
    id: "project-1",
    name: "beta refresh",
    color: "#111111",
  },
];

test("sortInboxProjects orders project names alphabetically", () => {
  const sorted = sortInboxProjects(projects as any);

  assert.deepEqual(
    sorted.map((project) => project.name),
    ["Alpha Rollout", "beta refresh", "zebra launch"],
  );
});

test("filterInboxProjects keeps alphabetical order while filtering", () => {
  const filtered = filterInboxProjects(projects as any, "a");

  assert.deepEqual(
    filtered.map((project) => project.name),
    ["Alpha Rollout", "beta refresh", "zebra launch"],
  );
});

test("filterInboxProjects returns exact matches case-insensitively", () => {
  const filtered = filterInboxProjects(projects as any, "BETA");

  assert.deepEqual(
    filtered.map((project) => project.id),
    ["project-1"],
  );
});

test("getEmailInboxSplitClassName constrains the detail pane without content-sized overflow", () => {
  const classes = getEmailInboxSplitClassName();

  assert.match(classes, /minmax\(0,1fr\)/);
  assert.match(classes, /var\(--email-detail-width\)/);
  assert.doesNotMatch(classes, /1\.2fr/);
});

test("clampEmailDetailPanelWidth enforces both minimum and available container width", () => {
  assert.equal(clampEmailDetailPanelWidth(240, 1200), 320);
  assert.equal(clampEmailDetailPanelWidth(900, 1200), 680);
  assert.equal(clampEmailDetailPanelWidth(410, 1200), 410);
});

test("buildEmailThreadPopoutUrl preserves the base route while forcing popout params", () => {
  assert.equal(
    buildEmailThreadPopoutUrl(
      "https://focusforge.test/email-inbox?selectedMailbox=all",
      "thread-42",
    ),
    "https://focusforge.test/email-inbox?selectedMailbox=all&threadId=thread-42&emailPopout=1",
  );
});

test("normalizeDockBadgeCount clamps invalid badge values to zero", () => {
  assert.equal(normalizeDockBadgeCount(-1), 0);
  assert.equal(normalizeDockBadgeCount(Number.NaN), 0);
  assert.equal(normalizeDockBadgeCount(3.9), 3);
});

test("getDockBadgeDocumentTitle prefixes unread counts for desktop shells", () => {
  assert.equal(getDockBadgeDocumentTitle(0), "Focus: Forge");
  assert.equal(getDockBadgeDocumentTitle(12), "(12) Focus: Forge");
});

test("Email inbox sort options default to date received first", () => {
  assert.equal(EMAIL_INBOX_SORT_OPTIONS[0]?.value, "received_desc");
  assert.match(
    EMAIL_INBOX_SORT_OPTIONS[0]?.label || "",
    /Date received \(Newest first\)/,
  );
});

test("sortInboxItemsForView orders inbox threads by newest received date first", () => {
  const sorted = sortInboxItemsForView(
    [
      {
        id: "older",
        subject: "Older thread",
        createdAt: "2026-04-01T09:00:00.000Z",
        latestInboundAt: "2026-04-02T09:00:00.000Z",
      },
      {
        id: "newest",
        subject: "Newest thread",
        createdAt: "2026-04-01T09:00:00.000Z",
        latestInboundAt: "2026-04-03T12:00:00.000Z",
      },
      {
        id: "fallback",
        subject: "Fallback thread",
        createdAt: "2026-04-03T08:00:00.000Z",
        latestInboundAt: null,
        latestMessageAt: null,
      },
    ] as any,
    "received_desc",
  );

  assert.deepEqual(
    sorted.map((item) => item.id),
    ["newest", "fallback", "older"],
  );
});

test("filterReplyDraftsForView narrows drafts by status", () => {
  const drafts = [
    { id: "draft-1", status: "draft" },
    { id: "draft-2", status: "scheduled" },
    { id: "draft-3", status: "failed" },
  ] as any;

  assert.deepEqual(
    filterReplyDraftsForView(drafts, "scheduled").map((draft) => draft.id),
    ["draft-2"],
  );
  assert.equal(filterReplyDraftsForView(drafts, "all").length, 3);
});

test("sortReplyDraftsForView prefers the most recently updated drafts", () => {
  const drafts = sortReplyDraftsForView([
    {
      id: "draft-1",
      updatedAt: "2026-04-13T08:00:00.000Z",
      createdAt: "2026-04-13T08:00:00.000Z",
      scheduledFor: null,
    },
    {
      id: "draft-2",
      updatedAt: "2026-04-13T09:30:00.000Z",
      createdAt: "2026-04-13T09:30:00.000Z",
      scheduledFor: null,
    },
  ] as any);

  assert.deepEqual(
    drafts.map((draft) => draft.id),
    ["draft-2", "draft-1"],
  );
});

test("Quarantine and spam actions use different icons", () => {
  assert.equal(getThreadActionButtonIconName("quarantine"), "shield");
  assert.equal(getThreadActionButtonIconName("spam"), "shield-alert");
  assert.equal(getThreadActionButtonIconName("delete"), "trash-2");
  assert.notEqual(
    getThreadActionButtonIconName("quarantine"),
    getThreadActionButtonIconName("spam"),
  );
});

test("delete undo duration formatter renders minutes for whole-minute values", () => {
  assert.equal(formatEmailDeleteUndoDuration(60), "1 minute");
  assert.equal(formatEmailDeleteUndoDuration(120), "2 minutes");
  assert.equal(formatEmailDeleteUndoDuration(45), "45 seconds");
});

test("thread action buttons render as fixed-size icon buttons", () => {
  const standardClasses = getThreadActionButtonClassName();
  const destructiveClasses = getThreadActionButtonClassName({
    destructive: true,
  });

  assert.match(standardClasses, /\bh-11\b/);
  assert.match(standardClasses, /\bw-11\b/);
  assert.match(standardClasses, /\bjustify-center\b/);
  assert.doesNotMatch(standardClasses, /\bpx-3\b/);
  assert.match(destructiveClasses, /border-red-900\/50/);
});

test("conversation entry header uses mirrored alignment for current user rows", () => {
  assert.equal(
    getConversationEntryHeaderClassName(true),
    "flex items-start gap-3",
  );
  assert.equal(
    getConversationEntryHeaderClassName(false),
    "flex items-start justify-between gap-3",
  );
});

test("applyOptimisticThreadReadState marks the selected thread read immediately", () => {
  const updated = applyOptimisticThreadReadState(
    [
      { id: "thread-1", isUnread: true },
      { id: "thread-2", isUnread: true },
    ] as any,
    "thread-1",
  );

  assert.equal(updated[0]?.isUnread, false);
  assert.equal(updated[1]?.isUnread, true);
});

test("applyOptimisticThreadActionState hides deleted threads immediately", () => {
  const updated = applyOptimisticThreadActionState(
    [
      {
        id: "thread-1",
        status: "active",
        classification: "actionable",
        isUnread: true,
        alwaysDelete: false,
      },
      { id: "thread-2", status: "active", classification: "unknown" },
    ] as any,
    "thread-1",
    "delete",
  );

  assert.equal(updated[0]?.status, "deleted");
  assert.equal(updated[0]?.isUnread, false);
  assert.equal(updated[0]?.classification, "spam");
  assert.equal(updated[1]?.status, "active");
});

test("applyOptimisticThreadActionState marks archive actions as read immediately", () => {
  const updated = applyOptimisticThreadActionState(
    [
      {
        id: "thread-1",
        status: "active",
        classification: "actionable",
        isUnread: true,
      },
    ] as any,
    "thread-1",
    "archive",
  );

  assert.equal(updated[0]?.status, "archived");
  assert.equal(updated[0]?.isUnread, false);
});

test("applyOptimisticThreadActionState preserves the original array when the thread is missing", () => {
  const items = [{ id: "thread-1", status: "active", isUnread: true }] as any;
  const updated = applyOptimisticThreadActionState(items, "missing", "delete");

  assert.equal(updated, items);
});

test("mergeInboxItem replaces the matching thread with the scanned result", () => {
  const updated = mergeInboxItem(
    [
      { id: "thread-1", status: "active", classification: "unknown" },
      { id: "thread-2", status: "active", classification: "unknown" },
    ] as any,
    { id: "thread-2", status: "quarantine", classification: "spam" } as any,
  );

  assert.equal(updated[0]?.status, "active");
  assert.equal(updated[1]?.status, "quarantine");
  assert.equal(updated[1]?.classification, "spam");
});

test("getSpamScanProgressPercent clamps progress to a usable width value", () => {
  assert.equal(getSpamScanProgressPercent(0, 0), 0);
  assert.equal(getSpamScanProgressPercent(1, 4), 25);
  assert.equal(getSpamScanProgressPercent(8, 4), 100);
});

test("filterInboxItemsForView returns only spam-marked inbox items on the spam tab", () => {
  const filtered = filterInboxItemsForView({
    inboxItems: [
      {
        id: "thread-1",
        mailboxId: "mailbox-1",
        status: "active",
        classification: "unknown",
        isUnread: true,
      },
      {
        id: "thread-2",
        mailboxId: "mailbox-1",
        status: "spam",
        classification: "spam",
        isUnread: false,
      },
      {
        id: "thread-3",
        mailboxId: "mailbox-1",
        status: "quarantine",
        classification: "spam",
        isUnread: true,
      },
    ] as any,
    selectedMailboxId: "all",
    filterTab: "spam",
    retainedSpamThreadIds: ["thread-3"],
    view: "email-inbox",
  });

  assert.deepEqual(
    filtered.map((item) => item.id),
    ["thread-2", "thread-3"],
  );
});

test("filterInboxItemsForView returns only deleted threads on the trash view", () => {
  const filtered = filterInboxItemsForView({
    inboxItems: [
      {
        id: "thread-1",
        mailboxId: "mailbox-1",
        status: "active",
        classification: "unknown",
      },
      {
        id: "thread-2",
        mailboxId: "mailbox-1",
        status: "deleted",
        classification: "spam",
      },
      {
        id: "thread-3",
        mailboxId: "mailbox-2",
        status: "deleted",
        classification: "spam",
      },
    ] as any,
    selectedMailboxId: "mailbox-1",
    filterTab: "all",
    retainedSpamThreadIds: [],
    view: "email-trash",
  });

  assert.deepEqual(
    filtered.map((item) => item.id),
    ["thread-2"],
  );
});

test("createRuleFormFromRule hydrates the rule editor with an editable not-spam rule", () => {
  const form = createRuleFormFromRule({
    id: "rule-1",
    name: "Allow payroll sender",
    description: "Never quarantine payroll mail.",
    mailboxId: null,
    priority: 25,
    matchMode: "all",
    stopProcessing: true,
    isActive: true,
    conditions: [
      {
        field: "sender_email",
        operator: "contains",
        value: "payroll@example.com",
      },
    ],
    actions: [{ type: "never_spam" }],
  } as any);

  assert.equal(form.name, "Allow payroll sender");
  assert.equal(form.mailboxId, "all");
  assert.equal(form.priority, "25");
  assert.match(form.conditionsJson, /payroll@example\.com/);
  assert.match(form.actionsJson, /never_spam/);
});
