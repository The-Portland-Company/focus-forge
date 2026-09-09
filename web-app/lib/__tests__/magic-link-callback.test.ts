/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { planMagicLinkCallback } from "../auth/magic-link-callback";
import { getMagicLinkCallbackUrl, sanitizeNextPath } from "../auth/urls";

test("planMagicLinkCallback exchanges a PKCE code and defaults next to /today", () => {
  const plan = planMagicLinkCallback(new URLSearchParams("code=abc123"));
  assert.deepEqual(plan, {
    action: "exchange-code",
    code: "abc123",
    next: "/today",
  });
});

test("planMagicLinkCallback preserves a safe next path", () => {
  const plan = planMagicLinkCallback(
    new URLSearchParams("code=abc123&next=%2Fprojects%2Fx"),
  );
  assert.equal(plan.action, "exchange-code");
  assert.equal((plan as { next: string }).next, "/projects/x");
});

test("planMagicLinkCallback drops an unsafe (external) next path", () => {
  const plan = planMagicLinkCallback(
    new URLSearchParams("code=abc123&next=https%3A%2F%2Fevil.com"),
  );
  assert.equal((plan as { next: string }).next, "/today");
});

test("planMagicLinkCallback handles a token_hash link", () => {
  const plan = planMagicLinkCallback(
    new URLSearchParams("token_hash=xyz&type=email"),
  );
  assert.deepEqual(plan, {
    action: "verify-otp",
    tokenHash: "xyz",
    type: "email",
    next: "/today",
  });
});

test("planMagicLinkCallback defaults token_hash type to magiclink", () => {
  const plan = planMagicLinkCallback(new URLSearchParams("token_hash=xyz"));
  assert.equal((plan as { type: string }).type, "magiclink");
});

test("planMagicLinkCallback surfaces an error_description", () => {
  const plan = planMagicLinkCallback(
    new URLSearchParams("error=access_denied&error_description=Email+link+is+invalid"),
  );
  assert.deepEqual(plan, {
    action: "error",
    message: "Email link is invalid",
  });
});

test("planMagicLinkCallback errors when nothing usable is present", () => {
  const plan = planMagicLinkCallback(new URLSearchParams(""));
  assert.equal(plan.action, "error");
});

test("sanitizeNextPath rejects protocol-relative and absolute URLs", () => {
  assert.equal(sanitizeNextPath("//evil.com"), null);
  assert.equal(sanitizeNextPath("https://evil.com"), null);
  assert.equal(sanitizeNextPath("/\\evil.com"), null);
  assert.equal(sanitizeNextPath("today"), null);
  assert.equal(sanitizeNextPath("/today"), "/today");
  assert.equal(sanitizeNextPath(null), null);
});

test("getMagicLinkCallbackUrl builds a callback with an encoded next", () => {
  assert.equal(
    getMagicLinkCallbackUrl({
      env: { NEXT_PUBLIC_APP_URL: "https://focusforge.theportlandcompany.com" },
      next: "/projects/x",
    }),
    "https://focusforge.theportlandcompany.com/auth/callback?next=%2Fprojects%2Fx",
  );
});

test("getMagicLinkCallbackUrl omits next when unsafe", () => {
  assert.equal(
    getMagicLinkCallbackUrl({
      env: { NEXT_PUBLIC_APP_URL: "https://focusforge.theportlandcompany.com" },
      next: "https://evil.com",
    }),
    "https://focusforge.theportlandcompany.com/auth/callback",
  );
});
