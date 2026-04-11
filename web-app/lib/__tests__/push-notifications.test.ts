/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeApnsPrivateKey } from "../push/apns";
import {
  buildInboxBrowserNotificationContent,
  buildEmailPushNotificationContent,
  listNewInboxItemsForNotification,
  shouldSendEmailPushNotification,
} from "../push/email";
import type { InboxItem } from "../types";

test("normalizeApnsPrivateKey restores escaped newlines", () => {
  const normalized = normalizeApnsPrivateKey(
    "apns-test-key-line-1\\napns-test-key-line-2",
  );

  assert.equal(
    normalized,
    "-----BEGIN PRIVATE KEY-----\napns-test-key-line-1\napns-test-key-line-2\n-----END PRIVATE KEY-----",
  );
});

test("buildEmailPushNotificationContent prefers mailbox name and sender", () => {
  assert.deepEqual(
    buildEmailPushNotificationContent({
      mailboxName: "Client Mailbox",
      mailboxEmailAddress: "client@example.com",
      senderName: "Casey Smith",
      senderEmail: "casey@example.com",
      subject: "Proposal feedback",
    }),
    {
      title: "Client Mailbox",
      body: "Casey Smith: Proposal feedback",
    },
  );
});

test("shouldSendEmailPushNotification skips backlog and spam states", () => {
  assert.equal(
    shouldSendEmailPushNotification({
      hadPreviousSync: false,
      status: "active",
      classification: "actionable",
      alwaysDelete: false,
    }),
    false,
  );

  assert.equal(
    shouldSendEmailPushNotification({
      hadPreviousSync: true,
      status: "quarantine",
      classification: "spam",
      alwaysDelete: false,
    }),
    false,
  );

  assert.equal(
    shouldSendEmailPushNotification({
      hadPreviousSync: true,
      status: "active",
      classification: "actionable",
      alwaysDelete: false,
    }),
    true,
  );
});

function makeInboxItem(
  overrides: Partial<InboxItem> & Pick<InboxItem, "id">,
): InboxItem {
  return {
    id: overrides.id,
    mailboxId: "mailbox-1",
    mailboxName: "Client Mailbox",
    mailboxEmailAddress: "client@example.com",
    projectId: null,
    ownerUserId: "user-1",
    summaryProfileId: null,
    status: "active",
    classification: "actionable",
    resolutionState: "open",
    actionTitle: "Review email",
    subject: "Proposal feedback",
    normalizedSubject: "proposal feedback",
    summaryText: null,
    previewText: null,
    actionConfidence: 0.9,
    actionReason: null,
    latestMessageAt: "2026-03-30T15:00:00.000Z",
    latestInboundAt: "2026-03-30T15:00:00.000Z",
    latestOutboundAt: null,
    workDueDate: null,
    workDueTime: null,
    needsProject: false,
    alwaysDelete: false,
    derivedTaskCount: 0,
    participants: [
      {
        id: "participant-1",
        emailAddress: "casey@example.com",
        displayName: "Casey Smith",
        participantRole: "from",
        profileId: null,
        contactId: null,
      },
    ],
    conversation: [],
    taskSuggestions: [],
    createdAt: "2026-03-30T15:00:00.000Z",
    updatedAt: "2026-03-30T15:00:00.000Z",
    ...overrides,
  };
}

test("buildInboxBrowserNotificationContent uses inbox sender metadata", () => {
  assert.deepEqual(
    buildInboxBrowserNotificationContent(
      makeInboxItem({
        id: "thread-1",
      }),
    ),
    {
      title: "Client Mailbox",
      body: "Casey Smith: Proposal feedback",
    },
  );
});

test("listNewInboxItemsForNotification returns only new inbound email items", () => {
  const existingThread = makeInboxItem({
    id: "thread-1",
    latestInboundAt: "2026-03-30T15:00:00.000Z",
    latestMessageAt: "2026-03-30T15:00:00.000Z",
  });
  const updatedInboundThread = makeInboxItem({
    id: "thread-1",
    latestInboundAt: "2026-03-30T15:05:00.000Z",
    latestMessageAt: "2026-03-30T15:05:00.000Z",
  });
  const outboundOnlyUpdate = makeInboxItem({
    id: "thread-2",
    latestInboundAt: "2026-03-30T14:00:00.000Z",
    latestMessageAt: "2026-03-30T15:10:00.000Z",
  });
  const outboundOnlyPrevious = makeInboxItem({
    id: "thread-2",
    latestInboundAt: "2026-03-30T14:00:00.000Z",
    latestMessageAt: "2026-03-30T14:30:00.000Z",
  });
  const spamThread = makeInboxItem({
    id: "thread-3",
    classification: "spam",
  });

  const items = listNewInboxItemsForNotification({
    previousItems: [existingThread, outboundOnlyPrevious],
    nextItems: [updatedInboundThread, outboundOnlyUpdate, spamThread],
  });

  assert.deepEqual(
    items.map((item) => item.id),
    ["thread-1"],
  );
});
