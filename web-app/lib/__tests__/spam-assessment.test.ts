/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAssessmentUserMessage,
  parseAssessmentResponse,
} from "@/lib/spam/assessment";
import { buildPolicyStatement } from "@/lib/spam/trainer";

const NOW = "2026-08-10T21:00:00.000Z";

const GOOD = JSON.stringify({
  verdict: "spam",
  confidence: 0.88,
  summary: "An unsolicited lead-generation pitch from an unknown domain.",
  signals: [
    {
      signal: "Unknown sender domain",
      detail: "talentconnect.shop has no prior history with you.",
      direction: "spam",
    },
    {
      signal: "Addressed by first name only",
      detail: "Subject is just 'Spencer'.",
      direction: "spam",
    },
  ],
  appliedPolicies: ["When emails read like a cold pitch they are spam."],
});

test("a well-formed reply becomes an assessment", () => {
  const result = parseAssessmentResponse(GOOD, "claude-opus-5", NOW);
  assert.ok(result);
  assert.equal(result.verdict, "spam");
  assert.equal(result.confidence, 0.88);
  assert.equal(result.signals.length, 2);
  assert.equal(result.appliedPolicies.length, 1);
  assert.equal(result.model, "claude-opus-5");
  assert.equal(result.generatedAt, NOW);
});

test("prose around the JSON is tolerated", () => {
  const result = parseAssessmentResponse(
    `Here you go:\n${GOOD}\nHope that helps.`,
    null,
    NOW,
  );
  assert.equal(result?.verdict, "spam");
});

test("a malformed reply yields null rather than an invented verdict", () => {
  assert.equal(parseAssessmentResponse("not json at all", null, NOW), null);
  assert.equal(
    parseAssessmentResponse(JSON.stringify({ verdict: "maybe" }), null, NOW),
    null,
  );
  assert.equal(
    parseAssessmentResponse(
      JSON.stringify({ verdict: "spam", summary: "   " }),
      null,
      NOW,
    ),
    null,
  );
});

test("confidence is clamped into 0..1", () => {
  const high = parseAssessmentResponse(
    JSON.stringify({ verdict: "spam", confidence: 42, summary: "x", signals: [] }),
    null,
    NOW,
  );
  const low = parseAssessmentResponse(
    JSON.stringify({ verdict: "spam", confidence: -3, summary: "x", signals: [] }),
    null,
    NOW,
  );
  assert.equal(high?.confidence, 1);
  assert.equal(low?.confidence, 0);
});

test("malformed individual signals are dropped, not fatal", () => {
  const result = parseAssessmentResponse(
    JSON.stringify({
      verdict: "not_spam",
      confidence: 0.5,
      summary: "Looks legitimate.",
      signals: [
        { signal: "Known contact", detail: "You have replied before.", direction: "not_spam" },
        { signal: 12, detail: "nope" },
        "garbage",
      ],
    }),
    null,
    NOW,
  );
  assert.equal(result?.signals.length, 1);
  assert.equal(result?.signals[0].direction, "not_spam");
});

test("the prompt carries the saved policies, or says there are none", () => {
  const base = {
    subject: "Spencer, more leads",
    senderEmail: "fred@talentconnect.shop",
    senderName: "Fred",
    previewText: "We can send you leads.",
    bodyText: null,
    currentClassification: "spam",
    knnConfidence: 0.9,
  };
  const withPolicies = buildAssessmentUserMessage({
    ...base,
    policies: ["When emails read like a cold pitch they are spam."],
  });
  assert.match(withPolicies, /saved spam policies/);
  assert.match(withPolicies, /1\. When emails read like a cold pitch/);
  assert.match(withPolicies, /90%/);

  const without = buildAssessmentUserMessage({ ...base, policies: [] });
  assert.match(without, /no saved spam policies yet/);
});

test("the finalized sentence reads the way it was asked to", () => {
  assert.equal(
    buildPolicyStatement("an unsolicited pitch offering leads", "spam"),
    "When emails read like an unsolicited pitch offering leads they will be marked as spam.",
  );
  assert.equal(
    buildPolicyStatement("a customer asking about a product", "not_spam"),
    "When emails read like a customer asking about a product they will not be marked as spam.",
  );
});

test("stray quotes and a trailing period do not double up", () => {
  assert.equal(
    buildPolicyStatement('"a cold sales pitch."', "spam"),
    "When emails read like a cold sales pitch they will be marked as spam.",
  );
});
