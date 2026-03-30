/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildThreadKey,
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
});
