/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { stripQuotedAndSignature } from "../email-inbox/strip-quoted";

test("strips 'On ... wrote:' quoted reply blocks", () => {
  const input = [
    "Sounds good, let's ship it.",
    "",
    "On Mon, Jun 2, 2026 at 10:00 AM John Doe <john@x.com> wrote:",
    "> previous message here",
    "> more quoted text",
  ].join("\n");
  assert.equal(stripQuotedAndSignature(input).trim(), "Sounds good, let's ship it.");
});

test("strips inline 'wrote:' attribution with trailing quote", () => {
  const input = "Reply body.\nOn 6/2/26, John wrote: > hi there old stuff";
  assert.equal(stripQuotedAndSignature(input).trim(), "Reply body.");
});

test("strips RFC 3676 signature delimiter", () => {
  const input = "Here is the answer.\n-- \nSpencer Hill\nCEO, Acme";
  assert.equal(stripQuotedAndSignature(input).trim(), "Here is the answer.");
});

test("strips leading quote lines", () => {
  const input = "My new note.\n> quoted reply\n> second line";
  assert.equal(stripQuotedAndSignature(input).trim(), "My new note.");
});

test("strips mobile 'Sent from my iPhone' footer", () => {
  const input = "Quick reply.\nSent from my iPhone";
  assert.equal(stripQuotedAndSignature(input).trim(), "Quick reply.");
});

test("strips Outlook 'From:' quoted header block", () => {
  const input = [
    "See below.",
    "",
    "From: someone@x.com",
    "Sent: Monday",
    "Subject: Re: thing",
  ].join("\n");
  assert.equal(stripQuotedAndSignature(input).trim(), "See below.");
});

test("strips forwarded message separator", () => {
  const input = "FYI\n---------- Forwarded message ---------\nFrom: a@b.com";
  assert.equal(stripQuotedAndSignature(input).trim(), "FYI");
});

test("strips standalone sign-off line", () => {
  const input = "Thanks for the update, I'll review it.\n\nBest regards,\nSpencer";
  assert.equal(
    stripQuotedAndSignature(input).trim(),
    "Thanks for the update, I'll review it.",
  );
});

test("strips localized attribution (Spanish)", () => {
  const input = "Perfecto.\nEl 2 jun 2026, a las 10:00, Juan escribió:\n> hola";
  assert.equal(stripQuotedAndSignature(input).trim(), "Perfecto.");
});

test("leaves plain content untouched when no markers present", () => {
  const input = "Just a normal message with no quotes or signature.";
  assert.equal(stripQuotedAndSignature(input), input);
});

test("does not strip a leading sign-off (no preceding content)", () => {
  const input = "Thanks";
  assert.equal(stripQuotedAndSignature(input), "Thanks");
});
