/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { getAppBaseUrl, getResetPasswordUrl } from "../auth/urls";

test("getAppBaseUrl prefers NEXT_PUBLIC_APP_URL", () => {
  assert.equal(
    getAppBaseUrl({
      env: {
        NEXT_PUBLIC_APP_URL: "https://app.focusforge.test/",
        NEXT_PUBLIC_SITE_URL: "https://site.focusforge.test",
      },
    }),
    "https://app.focusforge.test",
  );
});

test("getAppBaseUrl falls back to NEXT_PUBLIC_SITE_URL", () => {
  assert.equal(
    getAppBaseUrl({
      env: {
        NEXT_PUBLIC_SITE_URL: "https://focusforge.theportlandcompany.com/",
      },
    }),
    "https://focusforge.theportlandcompany.com",
  );
});

test("getAppBaseUrl falls back to the request origin", () => {
  assert.equal(
    getAppBaseUrl({
      requestUrl:
        "https://focusforge.theportlandcompany.com/api/auth/forgot-password",
      env: {},
    }),
    "https://focusforge.theportlandcompany.com",
  );
});

test("getResetPasswordUrl appends the recovery path", () => {
  assert.equal(
    getResetPasswordUrl({
      env: {
        NEXT_PUBLIC_SITE_URL: "https://focusforge.theportlandcompany.com",
      },
    }),
    "https://focusforge.theportlandcompany.com/auth/reset-password",
  );
});
