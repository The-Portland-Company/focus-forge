/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { forgetOverridesForFilledSections } from "@/lib/empty-section-prefs";

test("an override survives while its task list is still empty", () => {
  const kept = forgetOverridesForFilledSections(["a", "b"], () => true);
  assert.deepEqual(kept, ["a", "b"]);
});

test("an override is dropped once its task list has tasks again", () => {
  // "a" picked up tasks, so its pin expires — it hides again next time it
  // empties, which is the point of the override being temporary.
  const kept = forgetOverridesForFilledSections(
    ["a", "b"],
    (id) => id !== "a",
  );
  assert.deepEqual(kept, ["b"]);
});

test("no overrides in, no overrides out", () => {
  assert.deepEqual(forgetOverridesForFilledSections([], () => true), []);
});
