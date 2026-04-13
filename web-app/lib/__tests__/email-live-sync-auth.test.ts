/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  buildLiveSyncToken,
  isValidLiveSyncToken,
} = require("../email-inbox/live-sync-auth.js");

test("live sync token validates only for the matching mailbox", () => {
  process.env.EMAIL_INBOX_LIVE_SYNC_SECRET = "test-live-sync-secret";

  const token = buildLiveSyncToken("mailbox-1");

  assert.equal(isValidLiveSyncToken("mailbox-1", token), true);
  assert.equal(isValidLiveSyncToken("mailbox-2", token), false);
  assert.equal(isValidLiveSyncToken("mailbox-1", "invalid-token"), false);
});
