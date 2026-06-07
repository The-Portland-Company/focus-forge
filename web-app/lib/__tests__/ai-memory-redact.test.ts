/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { redactSensitiveMemoryText } from "../ai-core/redact";

test("redacts OpenAI secret key (sk-...)", () => {
  const input = "The API key is sk-abcdefghijklmnopqrstuvwxyz1234567890";
  const result = redactSensitiveMemoryText(input);
  assert.ok(!result.includes("sk-abcdefghijklmnopqrstuvwxyz"), "OpenAI key should be redacted");
  assert.ok(result.includes("[REDACTED]"), "Should contain [REDACTED]");
});

test("redacts Supabase PAT (sbp_...)", () => {
  const token = "sbp_" + "a".repeat(40);
  const input = `Using token ${token} to authenticate`;
  const result = redactSensitiveMemoryText(input);
  assert.ok(!result.includes(token), "sbp_ token should be redacted");
  assert.ok(result.includes("[REDACTED]"), "Should contain [REDACTED]");
});

test('redacts password: hunter2', () => {
  const input = "password: hunter2";
  const result = redactSensitiveMemoryText(input);
  assert.ok(!result.includes("hunter2"), "Password value should be redacted");
  assert.ok(result.includes("[REDACTED]"), "Should contain [REDACTED]");
});

test("redacts bearer token", () => {
  const input = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig";
  const result = redactSensitiveMemoryText(input);
  assert.ok(!result.includes("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"), "Bearer token should be redacted");
  assert.ok(result.includes("Bearer [REDACTED]"), "Should show Bearer [REDACTED]");
});

test("redacts 16-digit credit card number", () => {
  const input = "Card number: 4111111111111111 on file";
  const result = redactSensitiveMemoryText(input);
  assert.ok(!result.includes("4111111111111111"), "Card number should be redacted");
  assert.ok(result.includes("[REDACTED]"), "Should contain [REDACTED]");
});

test("redacts SSN 123-45-6789", () => {
  const input = "SSN on file: 123-45-6789";
  const result = redactSensitiveMemoryText(input);
  assert.ok(!result.includes("123-45-6789"), "SSN should be redacted");
  assert.ok(result.includes("[REDACTED]"), "Should contain [REDACTED]");
});

test("leaves normal text unchanged", () => {
  const input = "Get your haircut";
  const result = redactSensitiveMemoryText(input);
  assert.equal(result, input, "Normal text should be unchanged");
});
