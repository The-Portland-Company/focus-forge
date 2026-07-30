/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildJudgeUserMessage,
  parseJudgeResponse,
} from "../email-inbox/ai-tab-judge";

const PROMPTS = ["is an invoice", "is a newsletter"];

test("parseJudgeResponse maps answers back to their questions", () => {
  const text = JSON.stringify({
    answers: [
      { question: "is a newsletter", answer: true },
      { question: "is an invoice", answer: false },
    ],
  });
  assert.deepEqual(parseJudgeResponse(text, PROMPTS), {
    "is an invoice": false,
    "is a newsletter": true,
  });
});

test("parseJudgeResponse falls back to position when the model reworded a question", () => {
  const text = JSON.stringify({
    answers: [
      { question: "Is this an invoice?", answer: true },
      { question: "Is this a newsletter?", answer: false },
    ],
  });
  assert.deepEqual(parseJudgeResponse(text, PROMPTS), {
    "is an invoice": true,
    "is a newsletter": false,
  });
});

test("parseJudgeResponse answers false for garbage, missing, or non-boolean replies", () => {
  assert.deepEqual(parseJudgeResponse("not json at all", PROMPTS), {
    "is an invoice": false,
    "is a newsletter": false,
  });
  assert.deepEqual(
    parseJudgeResponse(
      JSON.stringify({ answers: [{ question: "is an invoice", answer: "yes" }] }),
      PROMPTS,
    ),
    { "is an invoice": false, "is a newsletter": false },
  );
});

test("parseJudgeResponse tolerates prose wrapped around the JSON object", () => {
  const text = `Sure!\n{"answers":[{"question":"is an invoice","answer":true}]}\nHope that helps.`;
  assert.equal(parseJudgeResponse(text, PROMPTS)["is an invoice"], true);
});

test("buildJudgeUserMessage clips long fields and numbers the questions", () => {
  const message = buildJudgeUserMessage({
    subject: "Invoice 42",
    summaryText: "x".repeat(1000),
    previewText: null,
    senderEmail: "billing@example.com",
    prompts: PROMPTS,
  });
  assert.match(message, /Subject: Invoice 42/);
  assert.match(message, /From: billing@example\.com/);
  assert.match(message, /Body preview: \(none\)/);
  assert.match(message, /1\. is an invoice/);
  assert.match(message, /2\. is a newsletter/);
  assert.ok(message.includes("…"), "long summary is clipped");
});
