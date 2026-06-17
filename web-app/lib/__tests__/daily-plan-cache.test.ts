/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { isForceReplan, shouldUseCache } from "../daily-plan/cache";

test("isForceReplan: false for empty / missing body", () => {
  assert.equal(isForceReplan(undefined), false);
  assert.equal(isForceReplan(null), false);
  assert.equal(isForceReplan({}), false);
});

test("isForceReplan: true when force is true", () => {
  assert.equal(isForceReplan({ force: true }), true);
});

test("isForceReplan: true when replan is true", () => {
  assert.equal(isForceReplan({ replan: true }), true);
});

test("isForceReplan: ignores truthy-but-not-boolean values", () => {
  assert.equal(isForceReplan({ force: "yes" }), false);
  assert.equal(isForceReplan({ force: 1 }), false);
  assert.equal(isForceReplan({ replan: false }), false);
});

test("shouldUseCache: uses cache when not forced and cached plan exists", () => {
  assert.equal(shouldUseCache(false, true), true);
});

test("shouldUseCache: skips cache when forced", () => {
  assert.equal(shouldUseCache(true, true), false);
});

test("shouldUseCache: skips cache when no cached plan exists", () => {
  assert.equal(shouldUseCache(false, false), false);
});
