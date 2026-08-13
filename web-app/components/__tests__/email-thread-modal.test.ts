/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  canMarkThreadAsRead,
  getEmailThreadHeaderSummaryText,
  shouldCloseEmailThreadModalAfterAction,
} from "../email-thread-modal";
import { getThreadProjectId } from "../../lib/email-thread-projects";
import {
  clampEmailDeleteUndoSeconds,
  getQueuedThreadActionMessage,
  getThreadActionLabel,
  requiresThreadActionConfirmation,
} from "../../lib/email-inbox/thread-actions";

test("shouldCloseEmailThreadModalAfterAction closes for actions that remove a thread from Today", () => {
  assert.equal(shouldCloseEmailThreadModalAfterAction("quarantine"), true);
  assert.equal(shouldCloseEmailThreadModalAfterAction("archive"), true);
  assert.equal(shouldCloseEmailThreadModalAfterAction("spam"), true);
  assert.equal(shouldCloseEmailThreadModalAfterAction("delete"), true);
  assert.equal(
    shouldCloseEmailThreadModalAfterAction("always_delete_sender"),
    true,
  );
});

test("shouldCloseEmailThreadModalAfterAction keeps the modal open for in-place actions", () => {
  assert.equal(shouldCloseEmailThreadModalAfterAction("approve"), false);
  assert.equal(shouldCloseEmailThreadModalAfterAction("mark_read"), false);
});

test("getThreadProjectId supports both camelCase and snake_case thread payloads", () => {
  assert.equal(getThreadProjectId({ projectId: "project-1" }), "project-1");
  assert.equal(getThreadProjectId({ project_id: "project-2" }), "project-2");
  assert.equal(getThreadProjectId(null), "");
});

test("canMarkThreadAsRead only returns true for unread threads", () => {
  assert.equal(canMarkThreadAsRead({ isUnread: true } as any), true);
  assert.equal(canMarkThreadAsRead({ isUnread: false } as any), false);
  assert.equal(canMarkThreadAsRead(null), false);
});

test("thread action confirmation only applies to destructive inbox actions", () => {
  assert.equal(requiresThreadActionConfirmation("quarantine"), true);
  assert.equal(requiresThreadActionConfirmation("archive"), true);
  assert.equal(requiresThreadActionConfirmation("spam"), true);
  assert.equal(requiresThreadActionConfirmation("always_delete_sender"), true);
  assert.equal(requiresThreadActionConfirmation("approve"), false);
  assert.equal(requiresThreadActionConfirmation("mark_read"), false);
});

test("queued thread action messaging uses the user-facing action label", () => {
  assert.equal(
    getThreadActionLabel("always_delete_sender"),
    "Always Delete Sender",
  );
  assert.equal(
    getQueuedThreadActionMessage("archive"),
    "Archive queued. Undo within 5 seconds.",
  );
  assert.equal(
    getQueuedThreadActionMessage("delete", 60),
    "Delete queued. Undo within 1 minute.",
  );
});

test("delete undo duration is clamped to supported profile limits", () => {
  assert.equal(clampEmailDeleteUndoSeconds(undefined), 60);
  assert.equal(clampEmailDeleteUndoSeconds(1), 5);
  assert.equal(clampEmailDeleteUndoSeconds(75.6), 76);
  assert.equal(clampEmailDeleteUndoSeconds(9999), 3600);
});

test("the header Summary row keeps its slot while the thread hydrates", () => {
  // Loaded: the real AI summary always wins.
  assert.equal(
    getEmailThreadHeaderSummaryText("Real AI summary", {
      summaryText: "Row summary",
    }),
    "Real AI summary",
  );
  // Loading: fall back to the inbox row so the row does not appear in the body
  // first and then jump up into the header.
  assert.equal(
    getEmailThreadHeaderSummaryText("", { summaryText: "Row summary" }),
    "Row summary",
  );
  assert.equal(
    getEmailThreadHeaderSummaryText("", { previewText: "Row preview" }),
    "Row preview",
  );
  // The greeting is stripped in both states so the seeded text matches the
  // loaded text character-for-character.
  assert.equal(
    getEmailThreadHeaderSummaryText("", {
      summaryText: "Hi Spencer, your ticket was denied.",
    }),
    "Your ticket was denied.",
  );
});

test("the header Summary row stays empty when there is nothing real to show", () => {
  assert.equal(getEmailThreadHeaderSummaryText("", null), "");
  assert.equal(getEmailThreadHeaderSummaryText("", {}), "");
  // An action title that merely repeats the subject is not a summary.
  assert.equal(
    getEmailThreadHeaderSummaryText("", {
      subject: "Denied Without Explanation",
      actionTitle: "Review and handle: Denied Without Explanation",
    }),
    "",
  );
});
