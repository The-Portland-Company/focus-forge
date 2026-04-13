/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMailboxSyncCursor,
  normalizeMailboxSyncCursor,
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
