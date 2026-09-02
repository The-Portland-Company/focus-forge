/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeThreadWithAI,
  buildHeuristicAnalysis,
  finalizeInboxSummary,
  formatAiGeneratedTaskName,
  greetsByBusinessName,
  normalizePreventedSpamResult,
  projectNameMatchesText,
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
    subject: "Claim your prize now",
    bodyText: "You have won the lottery — send a fee to claim your prize.",
    senderEmail: "promo@offers.example",
    mailboxEmail: "ops@example.com",
    projectOptions: [],
  });

  assert.equal(result.status, "quarantine");
  assert.equal(result.classification, "spam");
  assert.equal(result.taskSuggestions.length, 0);
});

test("buildHeuristicAnalysis does NOT quarantine legit mail containing 'unsubscribe'", () => {
  // Regression: 'unsubscribe' (CAN-SPAM required on legit bulk mail) used to
  // quarantine newsletters, receipts and transactional notices on the
  // heuristic-only path (LLM providers down).
  const result = buildHeuristicAnalysis({
    subject: "Your receipt from Acme",
    bodyText: "Thanks for your payment. Manage preferences or unsubscribe here.",
    senderEmail: "billing@acme.example",
    mailboxEmail: "ops@example.com",
    projectOptions: [],
  });

  assert.notEqual(result.status, "quarantine");
  assert.notEqual(result.classification, "spam");
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

test("projectNameMatchesText requires a whole-word match (short names never match inside words)", () => {
  // Regression: the 2-char project "RV" used to substring-match inside common
  // words ("service", "server", "observe", "survey", "reserve"), auto-filing
  // ~89 infra/notification emails into it.
  assert.equal(
    projectNameMatchesText("RV", "your service may continue uninterrupted"),
    false,
  );
  assert.equal(projectNameMatchesText("RV", "your server was rebooted"), false);
  assert.equal(projectNameMatchesText("RV", "please observe the reserve survey"), false);
  // A standalone token still matches.
  assert.equal(projectNameMatchesText("RV", "fix the rv roof this weekend"), true);
  assert.equal(projectNameMatchesText("RV", "the rv needs weatherizing"), true);
  // Multi-word names still match as a phrase.
  assert.equal(
    projectNameMatchesText("Acme Website", "please review the acme website proposal"),
    true,
  );
});

test("guessProjectId (via buildHeuristicAnalysis) no longer mis-routes to a 2-char project", () => {
  const rv = { id: "rv-project", name: "RV", description: "" };
  // Infra/notification email — must NOT land in RV.
  const infra = buildHeuristicAnalysis({
    subject: "Your service may continue",
    bodyText: "Your Cloudflare service will continue on the current plan.",
    senderEmail: "noreply@cloudflare.com",
    mailboxEmail: "ops@example.com",
    projectOptions: [rv],
  });
  assert.notEqual(infra.projectId, "rv-project");

  // Genuine RV work — still routes to RV.
  const roof = buildHeuristicAnalysis({
    subject: "RV roof repair quote",
    bodyText: "Here is the quote to fix the RV roof and weatherize it.",
    senderEmail: "contractor@example.com",
    mailboxEmail: "ops@example.com",
    projectOptions: [rv],
  });
  assert.equal(roof.projectId, "rv-project");
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
    subject: "Claim your prize now",
    bodyText: "You have won the lottery — send a fee to claim your prize.",
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

test("greetsByBusinessName flags a business-name greeting only when no personal name is present", () => {
  const names = ["Spencer", "Hill", "Spencer Hill"];
  // Greets the company, no personal name → the mass-merge tell.
  assert.equal(
    greetsByBusinessName("Hi Acme Co, we can grow your leads.", "Acme Co", names),
    true,
  );
  assert.equal(
    greetsByBusinessName("Dear Acme Co — quick question.", "Acme Co", names),
    true,
  );
  // A personal greeting that merely mentions the company is NOT the pattern.
  assert.equal(
    greetsByBusinessName("Hi Spencer, about Acme Co's order…", "Acme Co", names),
    false,
  );
  // Company named later in the body (not the greeting slot) → no match.
  assert.equal(
    greetsByBusinessName("Hello, following up on the Acme Co invoice.", "Acme Co", names),
    false,
  );
  // No business name / too short → never fires.
  assert.equal(greetsByBusinessName("Hi Acme Co,", null, names), false);
  assert.equal(greetsByBusinessName("Hi Ac,", "Ac", names), false);
});

test("analyzeThreadWithAI carries recipient/business names and remaps AI spam to quarantine", async () => {
  // Drive the OpenAI leg with an explicit chain + key, and mock the wire so we
  // can (1) inspect the outbound prompt and (2) feed back a status:"spam" reply,
  // asserting the AI spam verdict is routed to QUARANTINE, never the spam bucket.
  const priorKey = process.env.OPENAI_API_KEY;
  const priorFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = "sk-test-openai";

  let capturedBody = "";
  globalThis.fetch = (async (_url: string, init?: { body?: string }) => {
    capturedBody = init?.body ?? "";
    const content = JSON.stringify({
      classification: "spam",
      status: "spam",
      actionTitle: "Cold pitch",
      summary: "An unsolicited cold sales pitch addressed to the company.",
      reason: "Greets the business by name, not a person.",
      confidence: 0.92,
      needsProject: false,
      projectId: null,
      taskSuggestions: [],
    });
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content } }] }),
      text: async () => "",
    };
  }) as unknown as typeof globalThis.fetch;

  try {
    const result = await analyzeThreadWithAI({
      subject: "Grow Acme Co revenue",
      bodyText: "Hi Acme Co, our agency can 10x your leads. Reply to learn more.",
      senderEmail: "sales@growthhackers.biz",
      mailboxEmail: "spencer@example.com",
      projectOptions: [],
      chain: [{ provider: "openai", model: "gpt-4.1" }],
      recipientNames: ["Spencer", "Hill", "Spencer Hill"],
      businessName: "Acme Co",
      spamPolicies: ["Cold agency pitches are spam."],
    });

    // The prompt reached the model with the identity context.
    const outbound = JSON.parse(capturedBody);
    const userMessage = String(outbound.messages[1].content);
    assert.match(userMessage, /Acme Co/);
    assert.match(userMessage, /Spencer Hill/);
    assert.match(userMessage, /greetingUsesBusinessName/);

    // AI said spam → we route to quarantine (reviewable), never the spam bucket.
    assert.equal(result.classification, "spam");
    assert.equal(result.status, "quarantine");
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
