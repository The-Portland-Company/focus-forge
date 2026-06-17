/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { formatRelativeSync } from "../email-inbox/format-relative-sync";

const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();

test("formatRelativeSync returns 'never' for missing or invalid input", () => {
  assert.equal(formatRelativeSync(null), "never");
  assert.equal(formatRelativeSync(undefined), "never");
  assert.equal(formatRelativeSync(""), "never");
  assert.equal(formatRelativeSync("not-a-date"), "never");
});

test("formatRelativeSync buckets recent times", () => {
  assert.equal(formatRelativeSync(iso(10 * 1000)), "just now");
  assert.equal(formatRelativeSync(iso(4 * 60 * 1000)), "4m ago");
  assert.equal(formatRelativeSync(iso(59 * 60 * 1000)), "59m ago");
});

test("formatRelativeSync buckets hours and days", () => {
  assert.equal(formatRelativeSync(iso(3 * 60 * 60 * 1000)), "3h ago");
  assert.equal(formatRelativeSync(iso(2 * 24 * 60 * 60 * 1000)), "2d ago");
});

test("formatRelativeSync treats future timestamps as 'just now'", () => {
  assert.equal(
    formatRelativeSync(new Date(Date.now() + 5000).toISOString()),
    "just now",
  );
});
