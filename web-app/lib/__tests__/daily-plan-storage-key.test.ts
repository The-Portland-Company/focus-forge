/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { dailyPlanStorageKey } from "../daily-plan/storage-key";

test("uses local calendar date with zero-padded month/day", () => {
  const d = new Date(2026, 0, 5); // Jan 5 2026, local time
  assert.equal(dailyPlanStorageKey(d), "dailyPlan:2026-01-05");
});

test("pads double-digit month/day correctly", () => {
  const d = new Date(2026, 10, 23); // Nov 23 2026
  assert.equal(dailyPlanStorageKey(d), "dailyPlan:2026-11-23");
});

test("different days produce different keys (new day -> regenerate)", () => {
  const day1 = dailyPlanStorageKey(new Date(2026, 5, 17));
  const day2 = dailyPlanStorageKey(new Date(2026, 5, 18));
  assert.notEqual(day1, day2);
});

test("same day produces a stable key (rehydrate cache, no rerun)", () => {
  const a = dailyPlanStorageKey(new Date(2026, 5, 17, 8, 0, 0));
  const b = dailyPlanStorageKey(new Date(2026, 5, 17, 22, 30, 0));
  assert.equal(a, b);
});

test("defaults to now when no date passed", () => {
  assert.match(dailyPlanStorageKey(), /^dailyPlan:\d{4}-\d{2}-\d{2}$/);
});
