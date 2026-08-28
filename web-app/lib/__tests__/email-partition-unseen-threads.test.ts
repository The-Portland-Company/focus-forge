/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { partitionThreadsByUnseen } from "../email-inbox/partition-unseen-threads";

test("a thread with an unseen message UID is unread", () => {
  const { unreadThreadIds, readThreadIds } = partitionThreadsByUnseen(
    [{ thread_id: "t1", provider_message_id: "10" }],
    new Set(["10"]),
  );
  assert.deepEqual(unreadThreadIds, ["t1"]);
  assert.deepEqual(readThreadIds, []);
});

test("a thread whose UIDs are all seen is read", () => {
  const { unreadThreadIds, readThreadIds } = partitionThreadsByUnseen(
    [
      { thread_id: "t1", provider_message_id: "10" },
      { thread_id: "t1", provider_message_id: "11" },
    ],
    new Set(), // nothing unseen
  );
  assert.deepEqual(unreadThreadIds, []);
  assert.deepEqual(readThreadIds, ["t1"]);
});

test("any unseen message in a thread wins over its seen siblings", () => {
  const { unreadThreadIds, readThreadIds } = partitionThreadsByUnseen(
    [
      { thread_id: "t1", provider_message_id: "10" },
      { thread_id: "t1", provider_message_id: "11" },
    ],
    new Set(["11"]),
  );
  assert.deepEqual(unreadThreadIds, ["t1"]);
  assert.deepEqual(readThreadIds, []);
});

test("mixed mailbox partitions correctly and every thread lands on exactly one side", () => {
  const rows = [
    { thread_id: "a", provider_message_id: "1" },
    { thread_id: "b", provider_message_id: "2" },
    { thread_id: "c", provider_message_id: "3" },
    { thread_id: "c", provider_message_id: "4" },
    { thread_id: "d", provider_message_id: "5" },
  ];
  const { unreadThreadIds, readThreadIds } = partitionThreadsByUnseen(
    rows,
    new Set(["1", "4"]), // a unread; c unread (via 4); b,d read
  );
  assert.deepEqual([...unreadThreadIds].sort(), ["a", "c"]);
  assert.deepEqual([...readThreadIds].sort(), ["b", "d"]);
  // No thread appears on both sides.
  const overlap = unreadThreadIds.filter((id) => readThreadIds.includes(id));
  assert.deepEqual(overlap, []);
});

test("rows missing thread or provider id are ignored", () => {
  const { unreadThreadIds, readThreadIds } = partitionThreadsByUnseen(
    [
      { thread_id: null, provider_message_id: "1" },
      { thread_id: "t1", provider_message_id: null },
      { thread_id: "t2", provider_message_id: "9" },
    ],
    new Set(["9"]),
  );
  assert.deepEqual(unreadThreadIds, ["t2"]);
  assert.deepEqual(readThreadIds, []);
});
