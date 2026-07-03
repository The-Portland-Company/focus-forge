/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMailboxSyncCursor,
  normalizeMailboxSyncCursor,
  resolveSpecialMailboxPath,
} from "../email-inbox/provider";

test("normalizeMailboxSyncCursor keeps only valid incremental cursor values", () => {
  assert.deepEqual(
    normalizeMailboxSyncCursor({
      highestUid: 42,
      lastSeenAt: "2026-04-13T14:56:40.000Z",
    }),
    {
      highestUid: 42,
      lastSeenAt: "2026-04-13T14:56:40.000Z",
    },
  );

  assert.deepEqual(
    normalizeMailboxSyncCursor({
      highestUid: "not-a-number",
      lastSeenAt: "not-a-date",
    }),
    {
      highestUid: null,
      lastSeenAt: null,
    },
  );
});

test("buildMailboxSyncCursor advances highest UID and newest message timestamp", () => {
  assert.deepEqual(
    buildMailboxSyncCursor({
      previousCursor: {
        highestUid: 40,
        lastSeenAt: "2026-04-13T14:30:00.000Z",
      },
      fallbackLastSeenAt: "2026-04-13T14:00:00.000Z",
      highestUid: 44,
      messages: [
        {
          receivedAt: "2026-04-13T14:56:40.000Z",
          sentAt: null,
        },
      ],
    }),
    {
      highestUid: 44,
      lastSeenAt: "2026-04-13T14:56:40.000Z",
    },
  );
});

test("buildMailboxSyncCursor preserves prior cursor when no new messages arrive", () => {
  assert.deepEqual(
    buildMailboxSyncCursor({
      previousCursor: {
        highestUid: 44,
        lastSeenAt: "2026-04-13T14:56:40.000Z",
      },
      fallbackLastSeenAt: "2026-04-13T14:00:00.000Z",
      messages: [],
      highestUid: null,
    }),
    {
      highestUid: 44,
      lastSeenAt: "2026-04-13T14:56:40.000Z",
    },
  );
});

test("resolveSpecialMailboxPath prefers \\Special-Use over folder names (Gmail)", async () => {
  // Gmail exposes special folders under [Gmail]/ with special-use attributes,
  // so a plain-name lookup ("Trash"/"Spam") would miss them — special-use wins.
  const gmailBoxes = [
    { path: "INBOX", name: "INBOX", specialUse: "\\Inbox" },
    { path: "[Gmail]/Spam", name: "Spam", specialUse: "\\Junk" },
    { path: "[Gmail]/Trash", name: "Trash", specialUse: "\\Trash" },
    { path: "[Gmail]/All Mail", name: "All Mail", specialUse: "\\All" },
  ];
  const client = { list: async () => gmailBoxes };

  assert.equal(
    await resolveSpecialMailboxPath(client, "\\Trash", ["trash"]),
    "[Gmail]/Trash",
  );
  assert.equal(
    await resolveSpecialMailboxPath(client, "\\Junk", ["spam", "junk"]),
    "[Gmail]/Spam",
  );
  assert.equal(
    await resolveSpecialMailboxPath(client, "\\All", ["all mail"]),
    "[Gmail]/All Mail",
  );
});

test("resolveSpecialMailboxPath falls back to folder names when special-use is absent", async () => {
  const plainImapBoxes = [
    { path: "INBOX", name: "INBOX" },
    { path: "Trash", name: "Trash" },
    { path: "Junk Email", name: "Junk Email" },
  ];
  const client = { list: async () => plainImapBoxes };

  assert.equal(
    await resolveSpecialMailboxPath(client, "\\Trash", ["trash", "deleted"]),
    "Trash",
  );
  assert.equal(
    await resolveSpecialMailboxPath(client, "\\Junk", ["junk email", "spam"]),
    "Junk Email",
  );
  assert.equal(
    await resolveSpecialMailboxPath(client, "\\Trash", ["nonexistent"]),
    null,
  );
});
