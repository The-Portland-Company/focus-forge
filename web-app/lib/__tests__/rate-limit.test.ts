/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { checkTokenRateLimit, checkApiTokenRateLimit, rateLimitKey } from "../api/rate-limit";

test("checkTokenRateLimit allows up to max requests within the window, then denies", () => {
  const store = new Map<string, number[]>();
  const now = 1000;
  const opts = { max: 3, windowMs: 1000, now: () => now, store };

  assert.equal(checkTokenRateLimit("pat:abc", opts).allowed, true);
  assert.equal(checkTokenRateLimit("pat:abc", opts).allowed, true);
  assert.equal(checkTokenRateLimit("pat:abc", opts).allowed, true);
  const fourth = checkTokenRateLimit("pat:abc", opts);
  assert.equal(fourth.allowed, false);
  assert.ok(fourth.retryAfterMs > 0);
});

test("checkTokenRateLimit allows again once the window slides past old hits", () => {
  const store = new Map<string, number[]>();
  let now = 0;
  const opts = { max: 1, windowMs: 1000, now: () => now, store };

  assert.equal(checkTokenRateLimit("pat:abc", opts).allowed, true);
  assert.equal(checkTokenRateLimit("pat:abc", opts).allowed, false);

  now = 1001;
  assert.equal(checkTokenRateLimit("pat:abc", opts).allowed, true);
});

test("checkTokenRateLimit keys are isolated per identity", () => {
  const store = new Map<string, number[]>();
  const opts = { max: 1, windowMs: 1000, now: () => 0, store };

  assert.equal(checkTokenRateLimit("pat:a", opts).allowed, true);
  assert.equal(checkTokenRateLimit("pat:b", opts).allowed, true);
  assert.equal(checkTokenRateLimit("pat:a", opts).allowed, false);
});

test("checkTokenRateLimit fails closed when the store throws", () => {
  const brokenStore = {
    get() {
      throw new Error("store unavailable");
    },
  } as unknown as Map<string, number[]>;

  const result = checkTokenRateLimit("pat:abc", {
    max: 5,
    windowMs: 1000,
    store: brokenStore,
  });
  assert.equal(result.allowed, false);
});

test("checkTokenRateLimit fails closed when the clock throws", () => {
  const result = checkTokenRateLimit("pat:abc", {
    max: 5,
    windowMs: 1000,
    now: () => {
      throw new Error("clock unavailable");
    },
  });
  assert.equal(result.allowed, false);
});

test("rateLimitKey namespaces distinct routes so buckets don't collide", () => {
  assert.equal(rateLimitKey("mobile", "user-1"), "mobile:user-1");
  assert.equal(rateLimitKey("mcp", "user-1"), "mcp:user-1");
  assert.notEqual(rateLimitKey("mobile", "user-1"), rateLimitKey("mcp", "user-1"));
});

test("checkApiTokenRateLimit applies default ceiling and namespaces by route", () => {
  const store = new Map<string, number[]>();
  const now = 0;
  for (let i = 0; i < 60; i++) {
    assert.equal(checkApiTokenRateLimit("mobile", "user-1", { now: () => now, store }).allowed, true);
  }
  assert.equal(checkApiTokenRateLimit("mobile", "user-1", { now: () => now, store }).allowed, false);
  // Different namespace, same user: separate bucket, still allowed.
  assert.equal(checkApiTokenRateLimit("mcp", "user-1", { now: () => now, store }).allowed, true);
});
