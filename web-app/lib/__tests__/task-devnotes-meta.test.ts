/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";

import { normalizeTaskContentFields } from "../devnotes-meta";
import { mapTaskFromDb, mapTaskToDb } from "../api/sync-mapper";

test("normalizeTaskContentFields extracts embedded task DevNotes metadata", () => {
  const normalized = normalizeTaskContentFields({
    description: "Task summary\n\n[DEVNOTES_META:embedded]",
  });

  assert.deepEqual(normalized, {
    description: "Task summary",
    devnotesMeta: "[DEVNOTES_META:embedded]",
  });
});

test("normalizeTaskContentFields prefers explicit task DevNotes metadata", () => {
  const normalized = normalizeTaskContentFields({
    description: "Task summary\n\n[DEVNOTES_META:embedded]",
    devnotes_meta: "[DEVNOTES_META:explicit]",
  });

  assert.deepEqual(normalized, {
    description: "Task summary",
    devnotesMeta: "[DEVNOTES_META:explicit]",
  });
});

test("task sync mapper round-trips devnotes metadata", () => {
  assert.equal(
    mapTaskFromDb({
      id: "task-1",
      name: "Task",
      description: "Body",
      devnotes_meta: "[DEVNOTES_META:token]",
    }).devnotesMeta,
    "[DEVNOTES_META:token]",
  );

  assert.deepEqual(
    mapTaskToDb({
      name: "Task",
      description: "Body",
      devnotesMeta: "[DEVNOTES_META:token]",
    }),
    {
      name: "Task",
      description: "Body",
      devnotes_meta: "[DEVNOTES_META:token]",
    },
  );
});
