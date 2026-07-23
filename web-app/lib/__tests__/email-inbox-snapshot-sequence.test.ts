import assert from "node:assert/strict";
import test from "node:test";

import { createSnapshotSequence } from "../email-inbox/snapshot-sequence";

test("issues strictly increasing sequence numbers", () => {
  const sequence = createSnapshotSequence();
  assert.equal(sequence.next(), 1);
  assert.equal(sequence.next(), 2);
  assert.equal(sequence.next(), 3);
});

test("applies responses that arrive in issue order", () => {
  const sequence = createSnapshotSequence();
  const first = sequence.next();
  const second = sequence.next();

  assert.equal(sequence.shouldApply(first), true);
  assert.equal(sequence.shouldApply(second), true);
});

test("drops a stale response that arrives after a newer one", () => {
  // The rapid-delete race: two refreshes in flight, the newer one (which sees
  // the thread as deleted) resolves first. The older response still describes
  // the thread as active and must not be applied, or the row comes back.
  const sequence = createSnapshotSequence();
  const stale = sequence.next();
  const fresh = sequence.next();

  assert.equal(sequence.shouldApply(fresh), true);
  assert.equal(sequence.shouldApply(stale), false);
});

test("keeps dropping every older response, not just the first", () => {
  // Four deletes in five seconds → four overlapping reads. If the newest lands
  // first, all three earlier ones must be discarded.
  const sequence = createSnapshotSequence();
  const issued = [
    sequence.next(),
    sequence.next(),
    sequence.next(),
    sequence.next(),
  ];
  const newest = issued.pop()!;

  assert.equal(sequence.shouldApply(newest), true);
  for (const stale of issued) {
    assert.equal(sequence.shouldApply(stale), false);
  }
});

test("re-applying the same sequence is allowed (idempotent)", () => {
  const sequence = createSnapshotSequence();
  const seq = sequence.next();

  assert.equal(sequence.shouldApply(seq), true);
  assert.equal(sequence.shouldApply(seq), true);
});
