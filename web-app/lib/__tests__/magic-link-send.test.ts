/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { buildMagicLinkUrl, checkRateLimit } from "../auth/magic-link";

test("buildMagicLinkUrl points at the web callback with token_hash", () => {
  assert.equal(
    buildMagicLinkUrl(
      "https://focusforge.theportlandcompany.com/auth/callback",
      "abc123",
    ),
    "https://focusforge.theportlandcompany.com/auth/callback?token_hash=abc123&type=magiclink",
  );
});

test("buildMagicLinkUrl works with the iOS custom scheme", () => {
  assert.equal(
    buildMagicLinkUrl("focusforge://auth-callback", "abc123"),
    "focusforge://auth-callback?token_hash=abc123&type=magiclink",
  );
});

test("buildMagicLinkUrl appends with & when redirectTo already has a query", () => {
  assert.equal(
    buildMagicLinkUrl(
      "https://focusforge.theportlandcompany.com/auth/callback?next=%2Fprojects",
      "abc123",
    ),
    "https://focusforge.theportlandcompany.com/auth/callback?next=%2Fprojects&token_hash=abc123&type=magiclink",
  );
});

test("buildMagicLinkUrl encodes the token and honors a custom type", () => {
  assert.equal(
    buildMagicLinkUrl("focusforge://auth-callback", "a b/c", "email"),
    "focusforge://auth-callback?token_hash=a%20b%2Fc&type=email",
  );
});

test("checkRateLimit allows up to max within the window then blocks", () => {
  const store = new Map<string, number[]>();
  const opts = { max: 3, windowMs: 1000, now: () => 1000, store };
  assert.equal(checkRateLimit("k", opts).allowed, true);
  assert.equal(checkRateLimit("k", opts).allowed, true);
  assert.equal(checkRateLimit("k", opts).allowed, true);
  const blocked = checkRateLimit("k", opts);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterMs > 0);
});

test("checkRateLimit lets requests through once the window slides past", () => {
  const store = new Map<string, number[]>();
  let now = 1000;
  const opts = { max: 1, windowMs: 1000, now: () => now, store };
  assert.equal(checkRateLimit("k", opts).allowed, true);
  assert.equal(checkRateLimit("k", opts).allowed, false);
  now = 2500; // past the 1000ms window
  assert.equal(checkRateLimit("k", opts).allowed, true);
});

test("checkRateLimit isolates keys (per-email vs per-ip)", () => {
  const store = new Map<string, number[]>();
  const opts = { max: 1, windowMs: 1000, now: () => 1000, store };
  assert.equal(checkRateLimit("email:a", opts).allowed, true);
  assert.equal(checkRateLimit("email:b", opts).allowed, true);
  assert.equal(checkRateLimit("email:a", opts).allowed, false);
});
