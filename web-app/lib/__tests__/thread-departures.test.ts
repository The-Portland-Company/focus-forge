/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEPARTURE_EXPLANATION_WINDOW_MS,
  describeDepartures,
  listExplainedDepartures,
} from "../email-inbox/thread-departures";

const NOW = 1_800_000_000_000;

const active = (id: string, subject: string) => ({
  id,
  subject,
  status: "active",
});

test("a touched thread moved to quarantine is explained", () => {
  const departures = listExplainedDepartures({
    previousItems: [active("t1", "Hey Spencer")],
    nextItems: [{ id: "t1", subject: "Hey Spencer", status: "quarantine" }],
    touchedAt: new Map([["t1", NOW - 2000]]),
    nowMs: NOW,
  });

  assert.equal(departures.length, 1);
  assert.equal(departures[0].destination, "Quarantine");
  assert.equal(
    describeDepartures(departures),
    "“Hey Spencer” moved to Quarantine.",
  );
});

test("a thread the user never touched is not reported", () => {
  const departures = listExplainedDepartures({
    previousItems: [active("t1", "Hey Spencer")],
    nextItems: [{ id: "t1", subject: "Hey Spencer", status: "archived" }],
    touchedAt: new Map(),
    nowMs: NOW,
  });
  assert.deepEqual(departures, []);
});

test("a departure long after the interaction is not attributed to it", () => {
  const departures = listExplainedDepartures({
    previousItems: [active("t1", "Hey Spencer")],
    nextItems: [{ id: "t1", subject: "Hey Spencer", status: "archived" }],
    touchedAt: new Map([
      ["t1", NOW - DEPARTURE_EXPLANATION_WINDOW_MS - 1_000],
    ]),
    nowMs: NOW,
  });
  assert.deepEqual(departures, []);
});

test("a thread that stays in the inbox is not reported", () => {
  const departures = listExplainedDepartures({
    previousItems: [active("t1", "Bid Proposal Invitation")],
    nextItems: [
      { id: "t1", subject: "Bid Proposal Invitation", status: "active" },
    ],
    touchedAt: new Map([["t1", NOW - 500]]),
    nowMs: NOW,
  });
  assert.deepEqual(departures, []);
});

test("a thread already out of the inbox before the snapshot is not re-reported", () => {
  const departures = listExplainedDepartures({
    previousItems: [{ id: "t1", subject: "Old", status: "quarantine" }],
    nextItems: [{ id: "t1", subject: "Old", status: "quarantine" }],
    touchedAt: new Map([["t1", NOW - 500]]),
    nowMs: NOW,
  });
  assert.deepEqual(departures, []);
});

test("a row that merely fell out of the capped window is not reported", () => {
  // Absence is not a departure — /api/email/inbox is recency-capped, so a
  // missing row is usually off the end of the list, not reclassified. Only an
  // observed status transition is reported.
  const departures = listExplainedDepartures({
    previousItems: [active("t1", "Hey Spencer")],
    nextItems: [],
    touchedAt: new Map([["t1", NOW - 500]]),
    nowMs: NOW,
  });
  assert.deepEqual(departures, []);
});

test("multiple departures collapse into one message", () => {
  const departures = listExplainedDepartures({
    previousItems: [active("t1", "Hey Spencer"), active("t2", "Bid Proposal")],
    nextItems: [
      { id: "t1", subject: "Hey Spencer", status: "quarantine" },
      { id: "t2", subject: "Bid Proposal", status: "archived" },
    ],
    touchedAt: new Map([
      ["t1", NOW - 500],
      ["t2", NOW - 900],
    ]),
    nowMs: NOW,
  });

  assert.equal(departures.length, 2);
  assert.equal(
    describeDepartures(departures),
    "2 emails moved to Quarantine / Archive.",
  );
});

test("no departures produces no message", () => {
  assert.equal(describeDepartures([]), null);
});
