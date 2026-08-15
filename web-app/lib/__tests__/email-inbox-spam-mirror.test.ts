/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  SPAM_MIRROR_SWEEP_LIMIT,
  SPAM_PROVIDER_LABEL_MARKER,
  selectSpamThreadsNeedingProviderMirror,
} from "../email-inbox/spam-mirror";

// Regression: spam detected on an earlier sync stayed in the Gmail Inbox
// because the provider mirror only ran over threads the current sync touched.
test("selects already-detected spam that was never pushed provider-side", () => {
  const selected = selectSpamThreadsNeedingProviderMirror({
    rows: [
      {
        id: "quarantined",
        classification: "spam",
        status: "quarantine",
        provider_label_name: null,
      },
      {
        id: "settled-spam",
        classification: "spam",
        status: "spam",
        provider_label_name: null,
      },
    ],
  });

  assert.deepEqual(selected, ["quarantined", "settled-spam"]);
});

test("is idempotent — a thread already marked moved is never re-selected", () => {
  const selected = selectSpamThreadsNeedingProviderMirror({
    rows: [
      {
        id: "already-moved",
        classification: "spam",
        status: "quarantine",
        provider_label_name: SPAM_PROVIDER_LABEL_MARKER,
      },
      {
        id: "still-in-inbox",
        classification: "spam",
        status: "quarantine",
        provider_label_name: null,
      },
    ],
  });

  assert.deepEqual(selected, ["still-in-inbox"]);
});

test("ignores threads that are not spam, and non-junk statuses", () => {
  const selected = selectSpamThreadsNeedingProviderMirror({
    rows: [
      {
        id: "actionable",
        classification: "actionable",
        status: "active",
        provider_label_name: null,
      },
      {
        id: "spam-but-active",
        classification: "spam",
        status: "active",
        provider_label_name: null,
      },
      {
        id: "spam-but-deleted",
        classification: "spam",
        status: "deleted",
        provider_label_name: null,
      },
      {
        id: "real",
        classification: "spam",
        status: "spam",
        provider_label_name: null,
      },
    ],
  });

  assert.deepEqual(selected, ["real"]);
});

test("skips threads the touched-thread mirror already handled this sync", () => {
  const selected = selectSpamThreadsNeedingProviderMirror({
    rows: [
      {
        id: "touched",
        classification: "spam",
        status: "quarantine",
        provider_label_name: null,
      },
      {
        id: "untouched",
        classification: "spam",
        status: "quarantine",
        provider_label_name: null,
      },
    ],
    skipThreadIds: new Set(["touched"]),
  });

  assert.deepEqual(selected, ["untouched"]);
});

test("is bounded so a backlog drains over several syncs", () => {
  const rows = Array.from({ length: 250 }, (_, index) => ({
    id: `thread-${index}`,
    classification: "spam",
    status: "quarantine",
    provider_label_name: null,
  }));

  const defaultLimited = selectSpamThreadsNeedingProviderMirror({ rows });
  assert.equal(defaultLimited.length, SPAM_MIRROR_SWEEP_LIMIT);
  assert.equal(defaultLimited[0], "thread-0");

  const explicitLimit = selectSpamThreadsNeedingProviderMirror({
    rows,
    limit: 5,
  });
  assert.equal(explicitLimit.length, 5);
});

test("tolerates empty, null, and malformed rows", () => {
  assert.deepEqual(selectSpamThreadsNeedingProviderMirror({ rows: null }), []);
  assert.deepEqual(selectSpamThreadsNeedingProviderMirror({ rows: [] }), []);
  assert.deepEqual(
    selectSpamThreadsNeedingProviderMirror({
      rows: [
        { id: null, classification: "spam", status: "spam" },
        { classification: "spam", status: "spam" },
        {
          id: "dupe",
          classification: "spam",
          status: "spam",
          provider_label_name: null,
        },
        {
          id: "dupe",
          classification: "spam",
          status: "spam",
          provider_label_name: null,
        },
      ],
    }),
    ["dupe"],
  );
});
