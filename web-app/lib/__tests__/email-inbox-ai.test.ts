/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeThreadWithAI,
  buildHeuristicAnalysis,
  finalizeInboxSummary,
  formatAiGeneratedTaskName,
  normalizePreventedSpamResult,
  repairGenericTaskName,
} from "../email-inbox/ai";

test("buildHeuristicAnalysis suppresses tasks for transactional notifications", () => {
  const billing = buildHeuristicAnalysis({
    subject: "[DigitalOcean] Billing Alert: Monthly Billable Usage",
    bodyText: "Your account has reached a billing threshold.",
    senderEmail: "billing@digitalocean.com",
    mailboxEmail: "ops@example.com",
    projectOptions: [],
  });
  assert.equal(billing.classification, "reference");
  assert.deepEqual(billing.taskSuggestions, []);

  const security = buildHeuristicAnalysis({
    subject: "Security alert",
    bodyText: "If this was you, you don't need to do anything.",
    senderEmail: "no-reply@accounts.google.com",
    mailboxEmail: "ops@example.com",
    projectOptions: [],
  });
  assert.deepEqual(security.taskSuggestions, []);
});

test("repairGenericTaskName rebuilds bare person-name titles from the subject", () => {
  assert.equal(
    repairGenericTaskName("Review and respond: Spencer", "Spencer"),
    "Review and respond: Spencer",
  );
  assert.equal(
    repairGenericTaskName(
      "Review and respond: Brittany",
      "Q3 marketing budget approval",
    ),
    "Review and respond: Q3 marketing budget approval",
  );
  assert.equal(
    repairGenericTaskName(
      "Review and respond: Client follow-up on the proposal",
      "Re: proposal",
    ),
    "Review and respond: Client follow-up on the proposal",
  );
});

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
  // The heuristic no longer prefixes actionable titles with "Reply and handle:";
  // the action title is the bare subject.
  assert.equal(result.classification, "actionable");
  assert.equal(result.actionTitle, "Acme website proposal");
  // The response summary is still derived from the actionable classification,
  // not the retired prefix.
  assert.equal(result.summary, "The sender needs a response about acme website proposal.");
});

test("formatAiGeneratedTaskName strips emojis and returns clean text", () => {
  assert.equal(
    formatAiGeneratedTaskName("Review and respond: The Portland Company"),
    "Review and respond: The Portland Company.",
  );
  assert.equal(
    formatAiGeneratedTaskName("🤖 👀 Review and 💬 Respond: Invoice"),
    "Review and Respond: Invoice.",
  );
});

test("finalizeInboxSummary replaces excerpt-like summaries with a compact paraphrase", () => {
  assert.equal(
    finalizeInboxSummary({
      summary:
        "Final Renewal Notice Hello, This is a final notice that one or more of your domains are past expiration.",
      subject: "Domain Expiration Final Renewal Notification from Cloudflare",
      bodyText:
        "Final Renewal Notice Hello, This is a final notice that one or more of your domains are past expiration. If you wou...",
      classification: "reference",
      status: "active",
      actionTitle:
        "Review context: Domain Expiration Final Renewal Notification from Cloudflare",
    }),
    "A domain renewal deadline is approaching and needs attention.",
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

test("analyzeThreadWithAI(forceHeuristic) returns local heuristics without an LLM call", async () => {
  // SPAM_FALLBACK_MODE=private enforcement: even with a key present, forceHeuristic
  // must short-circuit to buildHeuristicAnalysis (no external OpenAI request). A
  // bogus key + unreachable fetch would fail loudly if the LLM path ran.
  const priorKey = process.env.OPENAI_API_KEY;
  const priorFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "sk-test-should-not-be-used";
  globalThis.fetch = () => {
    throw new Error("forceHeuristic must not make a network call");
  };

  try {
    const input = {
      subject: "Acme website proposal",
      bodyText: "Please review the Acme website proposal and reply today.",
      senderEmail: "client@acme.com",
      mailboxEmail: "team@example.com",
      forceHeuristic: true,
      projectOptions: [
        {
          id: "project-1",
          name: "Acme Website",
          description: "Website redesign for Acme",
        },
      ],
    };

    const result = await analyzeThreadWithAI(input);
    assert.deepEqual(result, buildHeuristicAnalysis(input));
  } finally {
    globalThis.fetch = priorFetch;
    if (priorKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = priorKey;
  }
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
