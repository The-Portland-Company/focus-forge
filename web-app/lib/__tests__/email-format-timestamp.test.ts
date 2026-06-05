/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  formatEmailTimestamp,
  getOrdinalDaySuffix,
} from "../email-inbox/format-timestamp";

// Build a local-time ISO-ish string the Date constructor parses as local time
// (no trailing Z), so the formatter's hour/day come out deterministically.
function local(
  year: number,
  month1: number,
  day: number,
  hour = 0,
  minute = 0,
): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month1)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00`;
}

test("formatEmailTimestamp renders the canonical format", () => {
  assert.equal(
    formatEmailTimestamp(local(2026, 1, 1, 14, 1)),
    "Jan. 1st, 2026 2:01 PM",
  );
});

test("formatEmailTimestamp drops the period only for May", () => {
  assert.equal(
    formatEmailTimestamp(local(2026, 5, 4, 9, 30)),
    "May 4th, 2026 9:30 AM",
  );
  assert.equal(
    formatEmailTimestamp(local(2026, 9, 2, 0, 5)),
    "Sep. 2nd, 2026 12:05 AM",
  );
});

test("formatEmailTimestamp handles noon and midnight hours", () => {
  assert.equal(
    formatEmailTimestamp(local(2026, 12, 3, 12, 0)),
    "Dec. 3rd, 2026 12:00 PM",
  );
  assert.equal(
    formatEmailTimestamp(local(2026, 6, 23, 0, 0)),
    "Jun. 23rd, 2026 12:00 AM",
  );
});

test("formatEmailTimestamp returns empty for missing or invalid input", () => {
  assert.equal(formatEmailTimestamp(null), "");
  assert.equal(formatEmailTimestamp(undefined), "");
  assert.equal(formatEmailTimestamp("not-a-date"), "");
});

test("getOrdinalDaySuffix covers teen and unit edge cases", () => {
  assert.equal(getOrdinalDaySuffix(1), "st");
  assert.equal(getOrdinalDaySuffix(2), "nd");
  assert.equal(getOrdinalDaySuffix(3), "rd");
  assert.equal(getOrdinalDaySuffix(4), "th");
  assert.equal(getOrdinalDaySuffix(11), "th");
  assert.equal(getOrdinalDaySuffix(12), "th");
  assert.equal(getOrdinalDaySuffix(13), "th");
  assert.equal(getOrdinalDaySuffix(21), "st");
  assert.equal(getOrdinalDaySuffix(22), "nd");
  assert.equal(getOrdinalDaySuffix(23), "rd");
  assert.equal(getOrdinalDaySuffix(31), "st");
});
