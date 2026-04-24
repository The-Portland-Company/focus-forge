import assert from "node:assert/strict";
import test from "node:test";
import { nullableEditFieldValue } from "../task-modal-payload";

test("nullableEditFieldValue keeps add payloads sparse", () => {
  assert.equal(nullableEditFieldValue("", false), undefined);
  assert.equal(nullableEditFieldValue("2026-04-24", false), "2026-04-24");
});

test("nullableEditFieldValue clears edit payload fields with null", () => {
  assert.equal(nullableEditFieldValue("", true), null);
  assert.equal(nullableEditFieldValue("2026-04-25", true), "2026-04-25");
});
