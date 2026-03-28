/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { formatElapsed } from "../time/client";

test("formatElapsed returns zero-padded hh:mm:ss", () => {
  const now = Date.now();
  const startedAt = new Date(now - (2 * 3600 + 5 * 60 + 9) * 1000).toISOString();
  const formatted = formatElapsed(startedAt);

  assert.match(formatted, /^\d{2}:\d{2}:\d{2}$/);
  const [hours, minutes] = formatted.split(":");
  assert.equal(hours, "02");
  assert.equal(minutes, "05");
});
