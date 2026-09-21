import { test } from "node:test";
import assert from "node:assert/strict";

import {
  initialMailboxWatchDecisionState,
  onMailboxWatchChangeEvent,
  onMailboxWatchDebounceFired,
  onMailboxWatchSyncSettled,
  initialMailboxWatchFallbackState,
  decideAfterWatchUnsupported,
  decideAfterWatchError,
  decideAfterWatchChangeObserved,
  DEFAULT_MAX_CONSECUTIVE_WATCH_ERRORS,
} from "../email-inbox/mailbox-watch";

// --- debounce / no-overlap decision state machine -----------------------

test("first change event schedules a timer", () => {
  const state = initialMailboxWatchDecisionState();
  const result = onMailboxWatchChangeEvent(state);
  assert.equal(result.scheduleTimer, true);
  assert.equal(result.state.timerPending, true);
});

test("a burst of change events while a timer is pending does not schedule a second timer", () => {
  let state = initialMailboxWatchDecisionState();
  state = onMailboxWatchChangeEvent(state).state;
  assert.equal(state.timerPending, true);

  // Simulate 'exists' then 'expunge' arriving back to back before the timer fires.
  const second = onMailboxWatchChangeEvent(state);
  const third = onMailboxWatchChangeEvent(second.state);

  assert.equal(second.scheduleTimer, false);
  assert.equal(third.scheduleTimer, false);
  assert.equal(third.state.timerPending, true);
});

test("debounce firing with no sync in flight runs a sync and clears timerPending", () => {
  const state = { timerPending: true, syncInFlight: false, rerunRequested: false };
  const result = onMailboxWatchDebounceFired(state);
  assert.equal(result.runSync, true);
  assert.equal(result.state.timerPending, false);
  assert.equal(result.state.syncInFlight, true);
});

test("a change event that arrives while a sync is in flight requests a rerun instead of overlapping", () => {
  const state = { timerPending: false, syncInFlight: true, rerunRequested: false };
  const result = onMailboxWatchChangeEvent(state);
  assert.equal(result.scheduleTimer, false, "must not start a second, overlapping sync path");
  assert.equal(result.state.rerunRequested, true);
  assert.equal(result.state.syncInFlight, true);
});

test("debounce firing while a sync is still in flight requests a rerun rather than starting a second sync", () => {
  const state = { timerPending: true, syncInFlight: true, rerunRequested: false };
  const result = onMailboxWatchDebounceFired(state);
  assert.equal(result.runSync, false, "two syncs for one mailbox must never overlap");
  assert.equal(result.state.rerunRequested, true);
  assert.equal(result.state.syncInFlight, true);
});

test("sync settling with a rerun requested schedules exactly one follow-up timer", () => {
  const state = { timerPending: false, syncInFlight: true, rerunRequested: true };
  const result = onMailboxWatchSyncSettled(state);
  assert.equal(result.scheduleTimer, true);
  assert.deepEqual(result.state, {
    timerPending: true,
    syncInFlight: false,
    rerunRequested: false,
  });
});

test("sync settling with no rerun requested returns to a fully idle state", () => {
  const state = { timerPending: false, syncInFlight: true, rerunRequested: false };
  const result = onMailboxWatchSyncSettled(state);
  assert.equal(result.scheduleTimer, false);
  assert.deepEqual(result.state, {
    timerPending: false,
    syncInFlight: false,
    rerunRequested: false,
  });
});

test("full burst-then-settle cycle never reports more than one sync in flight at a time", () => {
  let state = initialMailboxWatchDecisionState();

  // Three 'exists' events land back to back.
  state = onMailboxWatchChangeEvent(state).state;
  state = onMailboxWatchChangeEvent(state).state;
  state = onMailboxWatchChangeEvent(state).state;
  assert.equal(state.syncInFlight, false);

  // Debounce fires -> exactly one sync starts.
  const fired = onMailboxWatchDebounceFired(state);
  state = fired.state;
  assert.equal(fired.runSync, true);
  assert.equal(state.syncInFlight, true);

  // More events arrive mid-sync; none of them may flip syncInFlight or
  // schedule a competing timer.
  state = onMailboxWatchChangeEvent(state).state;
  state = onMailboxWatchChangeEvent(state).state;
  assert.equal(state.syncInFlight, true);
  assert.equal(state.rerunRequested, true);

  // Sync settles -> exactly one follow-up sync is queued, not two.
  const settled = onMailboxWatchSyncSettled(state);
  assert.equal(settled.scheduleTimer, true);
  const refired = onMailboxWatchDebounceFired(settled.state);
  assert.equal(refired.runSync, true);
  assert.equal(refired.state.syncInFlight, true);
});

// --- IDLE-vs-poll fallback decision state machine -----------------------

test("an unsupported response falls back to polling immediately, no retries", () => {
  const result = decideAfterWatchUnsupported();
  assert.equal(result.mode, "poll");
  assert.equal(result.consecutiveErrors, 0);
});

test("a single transient error does not fall back to polling", () => {
  const state = initialMailboxWatchFallbackState();
  const result = decideAfterWatchError(state);
  assert.equal(result.mode, "idle", "watchMailboxForChanges already retries transient drops");
  assert.equal(result.consecutiveErrors, 1);
});

test("errors below the threshold stay on IDLE", () => {
  let state = initialMailboxWatchFallbackState();
  for (let i = 0; i < DEFAULT_MAX_CONSECUTIVE_WATCH_ERRORS - 1; i++) {
    state = decideAfterWatchError(state);
  }
  assert.equal(state.mode, "idle");
});

test("errors reaching the threshold fall back to polling", () => {
  let state = initialMailboxWatchFallbackState();
  for (let i = 0; i < DEFAULT_MAX_CONSECUTIVE_WATCH_ERRORS; i++) {
    state = decideAfterWatchError(state);
  }
  assert.equal(state.mode, "poll");
});

test("a successful change observation resets the error streak", () => {
  let state = initialMailboxWatchFallbackState();
  state = decideAfterWatchError(state);
  state = decideAfterWatchError(state);
  assert.equal(state.consecutiveErrors, 2);

  state = decideAfterWatchChangeObserved();
  assert.deepEqual(state, { mode: "idle", consecutiveErrors: 0 });
});

test("a custom error threshold is respected", () => {
  let state = initialMailboxWatchFallbackState();
  state = decideAfterWatchError(state, 1);
  assert.equal(state.mode, "poll", "threshold of 1 should fall back on the first error");
});
