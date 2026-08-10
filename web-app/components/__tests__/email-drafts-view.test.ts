/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  draftQueueCategory,
  selectDraftRows,
} from "@/components/email-drafts-view";

test("a plain draft is in the Drafts category", () => {
  assert.equal(draftQueueCategory({ status: "draft" }), "draft");
});

test("anything with a scheduled time is Scheduled", () => {
  assert.equal(
    draftQueueCategory({ status: "draft", scheduledFor: "2026-09-01T10:00:00Z" }),
    "scheduled",
  );
  assert.equal(draftQueueCategory({ status: "scheduled" }), "scheduled");
});

test("Failed is a status, not a category — a failed draft stays under Drafts", () => {
  assert.equal(draftQueueCategory({ status: "failed" }), "draft");
});

test("a failed scheduled send stays under Scheduled", () => {
  assert.equal(
    draftQueueCategory({ status: "failed", scheduledFor: "2026-09-01T10:00:00Z" }),
    "scheduled",
  );
});

const ROWS = [
  { id: "1", status: "draft", searchText: "hello alice" },
  { id: "2", status: "failed", searchText: "retry bob" },
  {
    id: "3",
    status: "scheduled",
    scheduledFor: "2026-09-01T10:00:00Z",
    searchText: "later carol",
  },
  {
    id: "4",
    status: "failed",
    scheduledFor: "2026-09-02T10:00:00Z",
    searchText: "later dave",
  },
  { id: "5", status: "sent", searchText: "done erin" },
];

test("the Drafts tab shows unscheduled drafts including failed ones", () => {
  assert.deepEqual(
    selectDraftRows(ROWS, "draft", "").map((r) => r.id),
    ["1", "2"],
  );
});

test("the Scheduled tab shows scheduled items including failed ones", () => {
  assert.deepEqual(
    selectDraftRows(ROWS, "scheduled", "").map((r) => r.id),
    ["3", "4"],
  );
});

test("sent mail never appears in either tab", () => {
  const all = [
    ...selectDraftRows(ROWS, "draft", ""),
    ...selectDraftRows(ROWS, "scheduled", ""),
  ];
  assert.equal(all.some((r) => r.id === "5"), false);
});

test("search narrows within the active tab", () => {
  assert.deepEqual(
    selectDraftRows(ROWS, "draft", "bob").map((r) => r.id),
    ["2"],
  );
  assert.equal(selectDraftRows(ROWS, "draft", "carol").length, 0);
});
