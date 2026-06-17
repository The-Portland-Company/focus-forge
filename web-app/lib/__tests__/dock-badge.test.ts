/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  computeUnreadBadgeCount,
  getDockBadgeDocumentTitle,
  normalizeDockBadgeCount,
  shouldPromptForBadgePermission,
} from "../dock-badge";
import type { InboxItem } from "../types";

function makeItem(overrides: Partial<InboxItem>): InboxItem {
  return {
    id: Math.random().toString(36).slice(2),
    mailboxId: "mb-1",
    status: "active",
    classification: "actionable",
    resolutionState: "open",
    actionTitle: "",
    subject: "",
    needsProject: false,
    alwaysDelete: false,
    derivedTaskCount: 0,
    origin: "inbound",
    isUnread: true,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

test("computeUnreadBadgeCount counts unread inbound active and needs_project mail", () => {
  const items = [
    makeItem({ isUnread: true }),
    makeItem({ isUnread: true, status: "needs_project" }),
    makeItem({ isUnread: false }),
  ];
  assert.equal(computeUnreadBadgeCount(items), 2);
});

test("computeUnreadBadgeCount excludes spam by status and by classification", () => {
  const items = [
    makeItem({ isUnread: true, status: "spam" }),
    makeItem({ isUnread: true, classification: "spam" }),
    makeItem({ isUnread: true }),
  ];
  assert.equal(computeUnreadBadgeCount(items), 1);
});

test("computeUnreadBadgeCount excludes quarantine, deleted, archived, resolved, and outbound", () => {
  const items = [
    makeItem({ isUnread: true, status: "quarantine" }),
    makeItem({ isUnread: true, status: "deleted" }),
    makeItem({ isUnread: true, status: "archived" }),
    makeItem({ isUnread: true, status: "resolved" }),
    makeItem({ isUnread: true, origin: "outbound" }),
  ];
  assert.equal(computeUnreadBadgeCount(items), 0);
});

test("normalizeDockBadgeCount clamps invalid badge values to zero", () => {
  assert.equal(normalizeDockBadgeCount(-1), 0);
  assert.equal(normalizeDockBadgeCount(Number.NaN), 0);
  assert.equal(normalizeDockBadgeCount(3.9), 3);
});

test("getDockBadgeDocumentTitle prefixes unread counts", () => {
  assert.equal(getDockBadgeDocumentTitle(0), "Focus: Forge");
  assert.equal(getDockBadgeDocumentTitle(12), "(12) Focus: Forge");
});

test("shouldPromptForBadgePermission prompts only when standalone, default, and not yet asked", () => {
  assert.equal(
    shouldPromptForBadgePermission({
      standalone: true,
      permission: "default",
      alreadyPrompted: false,
    }),
    true,
  );
});

test("shouldPromptForBadgePermission never prompts outside an installed web app", () => {
  assert.equal(
    shouldPromptForBadgePermission({
      standalone: false,
      permission: "default",
      alreadyPrompted: false,
    }),
    false,
  );
});

test("shouldPromptForBadgePermission skips when already granted or denied", () => {
  assert.equal(
    shouldPromptForBadgePermission({
      standalone: true,
      permission: "granted",
      alreadyPrompted: false,
    }),
    false,
  );
  assert.equal(
    shouldPromptForBadgePermission({
      standalone: true,
      permission: "denied",
      alreadyPrompted: false,
    }),
    false,
  );
});

test("shouldPromptForBadgePermission skips when the prompt flag is already set", () => {
  assert.equal(
    shouldPromptForBadgePermission({
      standalone: true,
      permission: "default",
      alreadyPrompted: true,
    }),
    false,
  );
});

test("shouldPromptForBadgePermission tolerates an undefined permission", () => {
  assert.equal(
    shouldPromptForBadgePermission({
      standalone: true,
      permission: undefined,
      alreadyPrompted: false,
    }),
    false,
  );
});
