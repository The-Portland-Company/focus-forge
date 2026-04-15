/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildThreadKey,
  coerceConversationEntry,
  extractMailboxErrorMessage,
  getMailboxPasswordValidationError,
  getVisibleMailboxSyncError,
  normalizeMailboxPassword,
  normalizeSubject,
  shouldShowInboxItemInToday,
} from "../email-inbox/shared";

test("normalizeSubject strips reply prefixes", () => {
  assert.equal(normalizeSubject("Re: Fwd: Client Update"), "client update");
});

test("buildThreadKey prefers references", () => {
  assert.equal(
    buildThreadKey({
      mailboxId: "mailbox-1",
      subject: "Client update",
      inReplyTo: "<message@example.com>",
      fromEmail: "client@example.com",
    }),
    "mailbox-1:ref:<message@example.com>",
  );
});

test("shouldShowInboxItemInToday keeps undated inbox work visible", () => {
  assert.equal(
    shouldShowInboxItemInToday({
      id: "thread-1",
      mailboxId: "mailbox-1",
      status: "active",
      classification: "actionable",
      resolutionState: "open",
      actionTitle: "Reply to client",
      subject: "Client question",
      needsProject: false,
      alwaysDelete: false,
      derivedTaskCount: 0,
      createdAt: "2026-03-29T10:00:00.000Z",
      updatedAt: "2026-03-29T10:00:00.000Z",
    }),
    true,
  );

  assert.equal(
    shouldShowInboxItemInToday({
      id: "thread-2",
      mailboxId: "mailbox-1",
      status: "active",
      classification: "actionable",
      resolutionState: "taskified",
      actionTitle: "Reply to client",
      subject: "Client question",
      workDueDate: "2026-03-30",
      needsProject: false,
      alwaysDelete: false,
      derivedTaskCount: 1,
      createdAt: "2026-03-29T10:00:00.000Z",
      updatedAt: "2026-03-29T10:00:00.000Z",
    }),
    false,
  );

  assert.equal(
    shouldShowInboxItemInToday({
      id: "thread-3",
      mailboxId: "mailbox-1",
      status: "resolved",
      classification: "waiting",
      resolutionState: "open",
      origin: "outbound",
      actionTitle: "Sent quote",
      subject: "Quote follow-up",
      needsProject: false,
      alwaysDelete: false,
      derivedTaskCount: 0,
      createdAt: "2026-03-29T10:00:00.000Z",
      updatedAt: "2026-03-29T10:00:00.000Z",
    }),
    false,
  );
});

test("extractMailboxErrorMessage prefers provider response text", () => {
  assert.equal(
    extractMailboxErrorMessage({
      responseText:
        "Application-specific password required: https://support.google.com/accounts/answer/185833 (Failure)",
      message: "Command failed",
    }),
    "Application-specific password required: https://support.google.com/accounts/answer/185833 (Failure)",
  );

  assert.equal(
    extractMailboxErrorMessage(new Error("Command failed")),
    "Command failed",
  );
});

test("normalizeMailboxPassword strips Gmail display spaces", () => {
  assert.equal(
    normalizeMailboxPassword("gmail", "abcd efgh ijkl mnop"),
    "abcdefghijklmnop",
  );
  assert.equal(
    normalizeMailboxPassword("microsoft", "  keep spaces inside  "),
    "keep spaces inside",
  );
});

test("getMailboxPasswordValidationError requires a Gmail app password", () => {
  assert.equal(
    getMailboxPasswordValidationError("gmail", "abcd efgh ijkl mnop"),
    null,
  );
  assert.equal(
    getMailboxPasswordValidationError("gmail", "my-normal-password123"),
    "Gmail requires a 16-character Google App Password. Paste the app password, not your normal Google password.",
  );
});

test("getVisibleMailboxSyncError surfaces mailbox-specific issues", () => {
  const mailboxes = [
    {
      id: "mailbox-1",
      ownerUserId: "user-1",
      name: "The Portland Company",
      emailAddress: "spencerhill@theportlandcompany.com",
      provider: "gmail" as const,
      isShared: false,
      autoSyncEnabled: true,
      syncFrequencyMinutes: 5,
      syncFolder: "INBOX",
      lastSyncError: "Application-specific password required",
      createdAt: "2026-03-29T10:00:00.000Z",
      updatedAt: "2026-03-29T10:00:00.000Z",
    },
  ];

  assert.equal(
    getVisibleMailboxSyncError(mailboxes, "all"),
    "The Portland Company: Gmail requires a 16-character Google App Password. Click Edit Mailbox, paste the app password, save, then sync again.",
  );
  assert.equal(
    getVisibleMailboxSyncError(mailboxes, "mailbox-1"),
    "Gmail requires a 16-character Google App Password. Click Edit Mailbox, paste the app password, save, then sync again.",
  );
});

test("coerceConversationEntry adds attachment routes and indices", () => {
  const entry = coerceConversationEntry({
    id: "message-1",
    direction: "inbound",
    subject: "Attachment test",
    body_text: "See attached",
    body_html: null,
    metadata_json: {
      attachments: [
        {
          filename: "Footer Issue.png",
          contentType: "image/png",
          contentDisposition: "attachment",
          size: 332732,
          related: false,
        },
      ],
    },
    received_at: "2026-04-10T15:00:00.000Z",
    created_at: "2026-04-10T15:00:00.000Z",
  });

  assert.equal(entry.attachments?.[0]?.attachmentIndex, 0);
  assert.equal(
    entry.attachments?.[0]?.url,
    "/api/email/messages/message-1/attachments/0",
  );
});
