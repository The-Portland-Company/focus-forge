/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMailboxSyncCursor,
  normalizeMailboxSyncCursor,
  resolveOrCreateLabelMailboxPath,
  resolveSpecialMailboxPath,
  Semaphore,
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

test("Semaphore never lets more than `max` holders run concurrently", async () => {
  const sem = new Semaphore(2);
  let active = 0;
  let peak = 0;
  const run = async () => {
    await sem.acquire();
    active += 1;
    peak = Math.max(peak, active);
    // yield the event loop so overlapping holders would be observable
    await new Promise((r) => setTimeout(r, 5));
    active -= 1;
    sem.release();
  };
  await Promise.all(Array.from({ length: 10 }, run));
  assert.equal(peak, 2, "at most 2 holders should ever be active at once");
  assert.equal(active, 0, "all holders released");
});

test("Semaphore releases waiters in FIFO order", async () => {
  const sem = new Semaphore(1);
  const order: number[] = [];
  await sem.acquire(); // hold the only slot
  const waiters = [1, 2, 3].map((n) =>
    sem.acquire().then(() => {
      order.push(n);
      sem.release();
    }),
  );
  sem.release(); // let the queue drain
  await Promise.all(waiters);
  assert.deepEqual(order, [1, 2, 3]);
});

// --- Category labels (inbox tabs mirrored into Gmail/IMAP) -------------------
//
// On Gmail a folder IS a label, so these paths decide which label an email gets
// and whether we create a duplicate beside one the user already made.

function labelClient(
  paths: string[],
  createImpl?: (path: string) => Promise<{ path?: string }>,
) {
  const created: string[] = [];
  return {
    created,
    list: async () =>
      paths.map((path) => ({
        path,
        name: path.split("/").pop() || path,
      })),
    mailboxCreate: async (path: string) => {
      created.push(path);
      if (createImpl) return createImpl(path);
      paths.push(path);
      return { path };
    },
  };
}

test("resolveOrCreateLabelMailboxPath reuses an existing label case-insensitively", async () => {
  const client = labelClient(["INBOX", "Receipts"]);
  assert.equal(
    await resolveOrCreateLabelMailboxPath(client, "receipts"),
    "Receipts",
  );
  assert.deepEqual(client.created, []);
});

test("resolveOrCreateLabelMailboxPath reuses a nested label by its leaf name", async () => {
  const client = labelClient(["INBOX", "Focus/Newsletters"]);
  assert.equal(
    await resolveOrCreateLabelMailboxPath(client, "Newsletters"),
    "Focus/Newsletters",
  );
  assert.deepEqual(client.created, []);
});

test("resolveOrCreateLabelMailboxPath creates the label when none exists", async () => {
  const client = labelClient(["INBOX"]);
  assert.equal(
    await resolveOrCreateLabelMailboxPath(client, "OTPs/2FAs"),
    "OTPs/2FAs",
  );
  assert.deepEqual(client.created, ["OTPs/2FAs"]);
});

test("resolveOrCreateLabelMailboxPath recovers when a racing client created the label first", async () => {
  const paths = ["INBOX"];
  const client = {
    list: async () =>
      paths.map((path) => ({ path, name: path.split("/").pop() || path })),
    mailboxCreate: async (path: string) => {
      // Simulate the server rejecting the create because another connection
      // (another sync, or Gmail itself) just made the same label.
      paths.push(path);
      throw new Error("ALREADYEXISTS");
    },
  };
  assert.equal(
    await resolveOrCreateLabelMailboxPath(client, "Transactional"),
    "Transactional",
  );
});

test("resolveOrCreateLabelMailboxPath ignores a blank label rather than creating one", async () => {
  const client = labelClient(["INBOX"]);
  assert.equal(await resolveOrCreateLabelMailboxPath(client, "   "), null);
  assert.deepEqual(client.created, []);
});
