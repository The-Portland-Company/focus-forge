import assert from "node:assert/strict";
import test from "node:test";

import {
  ALERT_DEFAULT_DURATION_MS,
  ALERT_STACK_VISIBLE_COUNT,
  dismissAlert,
  getVisibleStackAlerts,
  hasOverflowAlerts,
  upsertAlert,
  type AppAlert,
} from "../alert-center";

function alert(id: string, overrides: Partial<AppAlert> = {}): AppAlert {
  return {
    id,
    type: "info",
    title: `Alert ${id}`,
    createdAt: 0,
    duration: 3000,
    ...overrides,
  };
}

test("upsert prepends new alerts (newest first)", () => {
  let alerts: AppAlert[] = [];
  alerts = upsertAlert(alerts, alert("a"));
  alerts = upsertAlert(alerts, alert("b"));

  assert.deepEqual(
    alerts.map((entry) => entry.id),
    ["b", "a"],
  );
});

test("upsert with an existing id replaces in place, keeping stack position", () => {
  let alerts: AppAlert[] = [];
  alerts = upsertAlert(alerts, alert("delete-1", { type: "progress" }));
  alerts = upsertAlert(alerts, alert("other"));
  alerts = upsertAlert(alerts, alert("delete-1", { type: "success" }));

  assert.deepEqual(
    alerts.map((entry) => entry.id),
    ["other", "delete-1"],
  );
  assert.equal(alerts[1].type, "success");
});

test("dismiss removes only the given alert; no-op returns same array", () => {
  let alerts: AppAlert[] = [alert("a"), alert("b")];
  const after = dismissAlert(alerts, "a");
  assert.deepEqual(
    after.map((entry) => entry.id),
    ["b"],
  );
  assert.equal(dismissAlert(after, "missing"), after);
});

test("collapsed stack shows at most the newest three", () => {
  const alerts = ["e", "d", "c", "b", "a"].map((id) => alert(id));
  const visible = getVisibleStackAlerts(alerts);

  assert.equal(visible.length, ALERT_STACK_VISIBLE_COUNT);
  assert.deepEqual(
    visible.map((entry) => entry.id),
    ["e", "d", "c"],
  );
  assert.equal(hasOverflowAlerts(alerts), true);
  assert.equal(hasOverflowAlerts(visible), false);
});

test("default durations: errors and progress are sticky, the rest expire", () => {
  assert.equal(ALERT_DEFAULT_DURATION_MS.error, 0);
  assert.equal(ALERT_DEFAULT_DURATION_MS.progress, 0);
  assert.ok(ALERT_DEFAULT_DURATION_MS.success > 0);
  assert.ok(ALERT_DEFAULT_DURATION_MS.info > 0);
  assert.ok(ALERT_DEFAULT_DURATION_MS.warning > 0);
});
