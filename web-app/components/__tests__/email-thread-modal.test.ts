/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  canMarkThreadAsRead,
  shouldCloseEmailThreadModalAfterAction,
} from "../email-thread-modal";
import { getThreadProjectId } from "../../lib/email-thread-projects";
import {
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
  assert.equal(getThreadActionLabel("always_delete_sender"), "Always Delete Sender");
  assert.equal(
    getQueuedThreadActionMessage("archive"),
    "Archive queued. Undo before it runs.",
  );
});
