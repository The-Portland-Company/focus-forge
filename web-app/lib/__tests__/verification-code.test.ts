/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { extractVerificationCode } from "../email-inbox/verification-code";

// --- Positives -------------------------------------------------------------

test("phrasing: your verification code is 123456", () => {
  assert.equal(
    extractVerificationCode("Sign in", "Your verification code is 123456"),
    "123456",
  );
});

test("phrasing: code: 482913", () => {
  assert.equal(extractVerificationCode("code: 482913", null), "482913");
});

test("Google G-123456 style", () => {
  assert.equal(
    extractVerificationCode("G-557231 is your Google verification code", null),
    "557231",
  );
});

test("phrasing: use 123456 to verify", () => {
  assert.equal(
    extractVerificationCode("Confirm your email", "Use 998877 to verify your account"),
    "998877",
  );
});

test("phrasing: OTP 1234", () => {
  assert.equal(extractVerificationCode("OTP 1234", null), "1234");
});

test("alphanumeric 6-char code with keyword", () => {
  assert.equal(
    extractVerificationCode("Your security code", "Your code is A1B2C3"),
    "A1B2C3",
  );
});

test("subject-only code", () => {
  assert.equal(
    extractVerificationCode("724813 is your one-time passcode", null),
    "724813",
  );
});

test("code is X phrasing", () => {
  assert.equal(
    extractVerificationCode("Verify", "Your login code is 90210"),
    "90210",
  );
});

test("standalone numeric near keyword in body", () => {
  assert.equal(
    extractVerificationCode(
      "Account verification",
      "Enter this verification code to continue: 246810",
    ),
    "246810",
  );
});

test("PIN phrasing", () => {
  assert.equal(extractVerificationCode("Your PIN: 5678", null), "5678");
});

// --- Negatives -------------------------------------------------------------

test("ignores years with no keyword", () => {
  assert.equal(
    extractVerificationCode("Happy New Year 2026!", "See you in 2026."),
    null,
  );
});

test("ignores a bare year even near a keyword", () => {
  assert.equal(
    extractVerificationCode("Order confirmation", "Confirmed for 2025"),
    null,
  );
});

test("ignores prices without keyword", () => {
  assert.equal(
    extractVerificationCode("Receipt", "Your total is 4999 dollars"),
    null,
  );
});

test("ignores order numbers without code keyword", () => {
  assert.equal(
    extractVerificationCode("Order #84726 shipped", "Tracking 84726 is on its way"),
    null,
  );
});

test("ignores phone numbers", () => {
  assert.equal(
    extractVerificationCode("Call us", "Reach support at 5551234"),
    null,
  );
});

test("returns null for plain marketing email", () => {
  assert.equal(
    extractVerificationCode("Big sale this weekend", "Save up to 50 percent on everything"),
    null,
  );
});

test("returns null for empty input", () => {
  assert.equal(extractVerificationCode(null, null), null);
  assert.equal(extractVerificationCode("", ""), null);
});

test("does not treat distant number as code", () => {
  const body =
    "Your verification code section is below.\n" +
    "A".repeat(120) +
    " 135790";
  assert.equal(extractVerificationCode("Verify your email", body), null);
});
