/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHeuristicAnalysis,
  formatAiGeneratedTaskName,
  normalizePreventedSpamResult,
} from "../email-inbox/ai";

test("buildHeuristicAnalysis quarantines obvious spam", () => {
  const result = buildHeuristicAnalysis({
    subject: "Limited time offer",
    bodyText: "Buy now and unsubscribe later",
    senderEmail: "promo@offers.example",
    mailboxEmail: "ops@example.com",
    projectOptions: [],
  });

  assert.equal(result.status, "quarantine");
  assert.equal(result.classification, "spam");
  assert.equal(result.taskSuggestions.length, 0);
});

test("buildHeuristicAnalysis quarantines unsolicited service pitch spam", () => {
  const result = buildHeuristicAnalysis({
    subject: "Program For Your Website Designing",
    bodyText:
      "Hey, We are an IT firm and a digital marketing company. Do you want to design or develop a website for a business? Kindly let me know. If interested, may I send you a sample, portfolio, and company Details?",
    senderEmail: "sinu@example.com",
    mailboxEmail: "ops@example.com",
    projectOptions: [],
  });

  assert.equal(result.status, "quarantine");
  assert.equal(result.classification, "spam");
  assert.equal(result.taskSuggestions.length, 0);
});

test("buildHeuristicAnalysis routes actionable email to a matching project", () => {
  const result = buildHeuristicAnalysis({
    subject: "Acme website proposal",
    bodyText: "Please review the Acme website proposal and reply today.",
    senderEmail: "client@acme.com",
    mailboxEmail: "team@example.com",
    projectOptions: [
      {
        id: "project-1",
        name: "Acme Website",
        description: "Website redesign for Acme",
      },
    ],
  });

  assert.equal(result.status, "active");
  assert.equal(result.projectId, "project-1");
  assert.equal(result.taskSuggestions.length > 0, true);
});

test("formatAiGeneratedTaskName decorates review/respond task names", () => {
  assert.equal(
    formatAiGeneratedTaskName("Review and respond: The Portland Company"),
    "🤖 👀 Review and 💬 Respond: The Portland Company.",
  );
});

test("buildHeuristicAnalysis skips spam classification when prevented by rule", () => {
  const result = buildHeuristicAnalysis({
    subject: "Limited time offer",
    bodyText: "Buy now and unsubscribe later",
    senderEmail: "promo@offers.example",
    mailboxEmail: "ops@example.com",
    preventSpamClassification: true,
    projectOptions: [],
  });

  assert.notEqual(result.classification, "spam");
  assert.notEqual(result.status, "quarantine");
});

test("normalizePreventedSpamResult falls back to the non-spam result", () => {
  const fallback = buildHeuristicAnalysis({
    subject: "Client follow-up",
    bodyText: "Please review the proposal and reply today.",
    senderEmail: "client@example.com",
    mailboxEmail: "ops@example.com",
    preventSpamClassification: true,
    projectOptions: [],
  });

  const normalized = normalizePreventedSpamResult(
    {
      ...fallback,
      classification: "spam",
      status: "quarantine",
    },
    fallback,
    true,
  );

  assert.deepEqual(normalized, fallback);
});
