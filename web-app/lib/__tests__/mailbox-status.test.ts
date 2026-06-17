/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  mailboxProviderLabel,
  mailboxStatus,
} from "@/lib/email-inbox/mailbox-status";

test("mailboxProviderLabel returns preset labels", () => {
  assert.equal(mailboxProviderLabel("gmail"), "Gmail");
  assert.equal(mailboxProviderLabel("microsoft"), "Microsoft 365 / Outlook");
  assert.equal(mailboxProviderLabel("imap_smtp"), "Custom IMAP / SMTP");
});

test("mailboxProviderLabel falls back to raw value for unknown provider", () => {
  assert.equal(
    mailboxProviderLabel("zoho" as never),
    "zoho",
  );
});

test("mailboxStatus reports error when lastSyncError is present", () => {
  const status = mailboxStatus({
    lastSyncedAt: "2026-01-01T00:00:00.000Z",
    lastSyncError: "Auth failed",
  });
  assert.equal(status.tone, "error");
  assert.equal(status.label, "Error");
  assert.equal(status.detail, "Auth failed");
});

test("mailboxStatus reports connected after a successful sync", () => {
  const status = mailboxStatus({
    lastSyncedAt: "2026-01-01T00:00:00.000Z",
    lastSyncError: null,
  });
  assert.equal(status.tone, "ok");
  assert.equal(status.label, "Connected");
  assert.equal(status.detail, null);
});

test("mailboxStatus reports not synced for a fresh mailbox", () => {
  const status = mailboxStatus({ lastSyncedAt: null, lastSyncError: null });
  assert.equal(status.tone, "idle");
  assert.equal(status.label, "Not synced");
  assert.equal(status.detail, null);
});
