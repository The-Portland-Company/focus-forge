/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { mapTimeScopes, normalizeTimeZone, resolveBaseUrl } from "../time/utils";

test("mapTimeScopes always includes read and removes unknown values", () => {
  assert.deepEqual(mapTimeScopes(["write", "nope", "admin"]), ["read", "write", "admin"]);
});

test("normalizeTimeZone falls back to UTC", () => {
  assert.equal(normalizeTimeZone("America/Los_Angeles"), "America/Los_Angeles");
  assert.equal(normalizeTimeZone(""), "UTC");
});

test("resolveBaseUrl returns a non-empty string", () => {
  assert.ok(resolveBaseUrl().length > 0);
});
