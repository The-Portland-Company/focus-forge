/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseDollarAmount,
  parseRecurrence,
  parseDeadline,
  inferKind,
  heuristicExtract,
} from "../domino/ai";

// Fixed reference clock: Wednesday, 2026-06-17 12:00:00 UTC.
const NOW = new Date("2026-06-17T12:00:00.000Z");

// ---------------------------------------------------------------------------
// parseDollarAmount
// ---------------------------------------------------------------------------
test("parseDollarAmount parses plain dollars", () => {
  assert.equal(parseDollarAmount("pay the $40 fee"), 40);
});

test("parseDollarAmount parses /week amount", () => {
  assert.equal(parseDollarAmount("the $40/week laundromat"), 40);
});

test("parseDollarAmount handles commas and decimals", () => {
  assert.equal(parseDollarAmount("owe $1,250.50 now"), 1250.5);
});

test("parseDollarAmount handles k suffix", () => {
  assert.equal(parseDollarAmount("a $2k penalty"), 2000);
});

test("parseDollarAmount returns null when absent", () => {
  assert.equal(parseDollarAmount("no money here"), null);
});

// ---------------------------------------------------------------------------
// parseRecurrence
// ---------------------------------------------------------------------------
test("parseRecurrence infers weekly from /week", () => {
  assert.deepEqual(parseRecurrence("$40/week"), {
    recurrence: "weekly",
    recurrence_interval_days: 7,
  });
});

test("parseRecurrence infers monthly from /month", () => {
  assert.deepEqual(parseRecurrence("$300/month rent"), {
    recurrence: "monthly",
    recurrence_interval_days: 30,
  });
});

test("parseRecurrence infers from 'per week'", () => {
  assert.deepEqual(parseRecurrence("costs me per week"), {
    recurrence: "weekly",
    recurrence_interval_days: 7,
  });
});

test("parseRecurrence handles 'every 2 weeks'", () => {
  assert.deepEqual(parseRecurrence("billed every 2 weeks"), {
    recurrence: "weekly",
    recurrence_interval_days: 14,
  });
});

test("parseRecurrence returns null with no cue", () => {
  assert.equal(parseRecurrence("one time fee"), null);
});

// ---------------------------------------------------------------------------
// parseDeadline
// ---------------------------------------------------------------------------
test("parseDeadline resolves 'by Friday' to next Friday", () => {
  // NOW is Wed 2026-06-17; Friday is 2026-06-19.
  const iso = parseDeadline("pay by Friday", NOW);
  assert.ok(iso);
  assert.equal(new Date(iso!).getUTCDate(), 19);
});

test("parseDeadline same weekday pushes to next week", () => {
  // NOW is Wednesday; "by Wednesday" → 7 days later = 2026-06-24.
  const iso = parseDeadline("due by Wednesday", NOW);
  assert.ok(iso);
  assert.equal(new Date(iso!).getUTCDate(), 24);
});

test("parseDeadline 'next week' adds 7 days", () => {
  const iso = parseDeadline("handle this next week", NOW);
  assert.ok(iso);
  assert.equal(new Date(iso!).getUTCDate(), 24);
});

test("parseDeadline 'next Friday' jumps an extra week", () => {
  const iso = parseDeadline("pay next Friday", NOW);
  assert.ok(iso);
  // Friday 06-19 + 7 = 06-26.
  assert.equal(new Date(iso!).getUTCDate(), 26);
});

test("parseDeadline handles 'tomorrow'", () => {
  const iso = parseDeadline("due tomorrow", NOW);
  assert.ok(iso);
  assert.equal(new Date(iso!).getUTCDate(), 18);
});

test("parseDeadline handles 'in 3 days'", () => {
  const iso = parseDeadline("in 3 days", NOW);
  assert.ok(iso);
  assert.equal(new Date(iso!).getUTCDate(), 20);
});

test("parseDeadline returns null without a cue", () => {
  assert.equal(parseDeadline("just a note", NOW), null);
});

// ---------------------------------------------------------------------------
// inferKind
// ---------------------------------------------------------------------------
test("inferKind defaults to consequence", () => {
  assert.equal(inferKind("I owe money"), "consequence");
});

test("inferKind detects reward", () => {
  assert.equal(inferKind("I earn a $500 bonus"), "reward");
});

// ---------------------------------------------------------------------------
// heuristicExtract (full sentence)
// ---------------------------------------------------------------------------
test("heuristicExtract on a full laundromat sentence", () => {
  const result = heuristicExtract(
    {
      text: "If I don't pay the $40/week laundromat by Friday I can't work",
    },
    NOW,
  );

  assert.equal(result.stakes.length, 1);
  const stake = result.stakes[0];
  assert.equal(stake.kind, "consequence");
  assert.equal(stake.monetary_value, 40);
  assert.equal(stake.severity, null);
  assert.equal(stake.recurrence, "weekly");
  assert.equal(stake.recurrence_interval_days, 7);
  assert.ok(stake.trigger_at);
  assert.equal(new Date(stake.trigger_at!).getUTCDate(), 19);
  // Name strips the leading conditional and trailing consequence clause.
  assert.ok(/laundromat/i.test(stake.name));
  assert.ok(!/^if/i.test(stake.name));
  assert.equal(result.edges.length, 0);
  assert.equal(result.links.length, 0);
  // Three signals resolved → confidence 0.4 + 3*0.15 = 0.85.
  assert.ok(Math.abs((result.confidence ?? 0) - 0.85) < 1e-9);
});

test("heuristicExtract falls back to severity when no dollar amount", () => {
  const result = heuristicExtract({ text: "I might lose a client" }, NOW);
  assert.equal(result.stakes[0].monetary_value, null);
  assert.equal(result.stakes[0].severity, "moderate");
});

test("heuristicExtract on empty input yields no stakes", () => {
  const result = heuristicExtract({ text: "   " }, NOW);
  assert.equal(result.stakes.length, 0);
  assert.equal(result.confidence, 0);
});
