import { test } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeOrgAISettings,
  resolveEmailChain,
} from "../ai/email-provider";
import {
  DEFAULT_EMAIL_CHAIN_IDS,
  modelsForSurface,
  normalizeChainIds,
} from "../ai/model-chains";
import {
  apiKeyEnvVar,
  defaultModelRunner,
  hasProviderKey,
} from "../ai/structured-waterfall";
import { analyzeThreadWithAI, buildHeuristicAnalysis } from "../email-inbox/ai";

// The email chain leads with DeepSeek deliberately: it is the highest-volume AI
// surface and the cheapest provider of the three.
test("the default email chain is DeepSeek -> Claude -> Grok", () => {
  assert.deepEqual(DEFAULT_EMAIL_CHAIN_IDS, [
    "deepseek-chat",
    "claude-opus-4-8",
    "grok-3",
  ]);
  assert.deepEqual(
    modelsForSurface("email").map((m) => m.provider),
    ["deepseek", "anthropic", "xai"],
  );
});

test("resolveEmailChain defaults to the DeepSeek-first chain when unset", () => {
  assert.deepEqual(resolveEmailChain(null), [
    { provider: "deepseek", model: "deepseek-chat" },
    { provider: "anthropic", model: "claude-opus-4-8" },
    { provider: "xai", model: "grok-3" },
  ]);
  assert.deepEqual(resolveEmailChain({}), resolveEmailChain(null));
});

test("resolveEmailChain honours an org's stored order", () => {
  const chain = resolveEmailChain({
    email: { enabled: true, chain: ["grok-3", "deepseek-chat"] },
  });
  assert.deepEqual(
    chain.map((spec) => spec.model),
    // The omitted model is appended in default order, never dropped.
    ["grok-3", "deepseek-chat", "claude-opus-4-8"],
  );
});

test("resolveEmailChain returns an empty chain when the org disabled AI triage", () => {
  assert.deepEqual(resolveEmailChain({ email: { enabled: false } }), []);
});

test("normalizeOrgAISettings drops unknown ids and coerces enabled", () => {
  const settings = normalizeOrgAISettings({
    email: { enabled: "yes", chain: ["not-a-model", "grok-3", "grok-3"] },
  });
  assert.equal(settings.email.enabled, true);
  assert.deepEqual(settings.email.chain, [
    "grok-3",
    "deepseek-chat",
    "claude-opus-4-8",
  ]);
  // Garbage in the column must not throw.
  assert.deepEqual(
    normalizeOrgAISettings("nonsense").email.chain,
    DEFAULT_EMAIL_CHAIN_IDS,
  );
});

// The email surface must never inherit estimator-only models (e.g. the
// fine-tuned Gemma LoRA), which normalizeChainIds appends for other surfaces.
test("normalizeChainIds(email) never force-appends estimator-only models", () => {
  const ids = normalizeChainIds(["ff-estimator-gemma2b", "gpt-4.1"], "email");
  assert.deepEqual(ids, DEFAULT_EMAIL_CHAIN_IDS);
  assert.ok(!ids.includes("ff-estimator-gemma2b"));
  assert.ok(!ids.includes("gpt-4.1"));
});

test("deepseek maps to DEEPSEEK_API_KEY and posts an OpenAI-compatible json_object request", async () => {
  assert.equal(apiKeyEnvVar("deepseek"), "DEEPSEEK_API_KEY");
  assert.equal(hasProviderKey("deepseek", { DEEPSEEK_API_KEY: "sk-x" }), true);
  assert.equal(hasProviderKey("deepseek", {}), false);

  const priorKey = process.env.DEEPSEEK_API_KEY;
  const priorFetch = globalThis.fetch;
  let seen: { url: string; init: any } | null = null;
  process.env.DEEPSEEK_API_KEY = "sk-deepseek-test";
  globalThis.fetch = (async (url: any, init: any) => {
    seen = { url: String(url), init };
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"ok":true}' } }],
      }),
    };
  }) as any;

  try {
    const text = await defaultModelRunner(
      { provider: "deepseek", model: "deepseek-chat" },
      {
        systemPrompt: "s",
        userMessage: "u",
        // DeepSeek rejects strict json_schema, so a supplied schema must NOT be
        // sent on the wire — it belongs in the prompt.
        jsonSchema: { name: "x", strict: true, schema: {} },
      },
    );
    assert.equal(text, '{"ok":true}');
  } finally {
    globalThis.fetch = priorFetch;
    if (priorKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = priorKey;
  }

  assert.ok(seen, "deepseek runner did not call fetch");
  const call = seen as unknown as { url: string; init: any };
  assert.equal(call.url, "https://api.deepseek.com/v1/chat/completions");
  assert.equal(
    call.init.headers.Authorization,
    "Bearer sk-deepseek-test",
  );
  const body = JSON.parse(call.init.body);
  assert.equal(body.model, "deepseek-chat");
  assert.deepEqual(body.response_format, { type: "json_object" });
});

const SPAM_FIXTURE = {
  subject: "Re: Ticket Id [#860606] - Denied Without Explanation",
  bodyText:
    "Your ticket was denied. Click here to reopen your case and confirm your account details.",
  senderEmail: "noreply-supportdesk@impact.com",
  mailboxEmail: "team@example.com",
  projectOptions: [],
};

test("analyzeThreadWithAI falls back to heuristics when no provider key is configured", async () => {
  const priorKeys: Record<string, string | undefined> = {};
  const priorFetch = globalThis.fetch;
  for (const key of [
    "DEEPSEEK_API_KEY",
    "ANTHROPIC_API_KEY",
    "XAI_API_KEY",
    "OPENAI_API_KEY",
  ]) {
    priorKeys[key] = process.env[key];
    delete process.env[key];
  }
  globalThis.fetch = (() => {
    throw new Error("no configured provider must not make a network call");
  }) as any;

  try {
    const result = await analyzeThreadWithAI(SPAM_FIXTURE);
    assert.deepEqual(result, buildHeuristicAnalysis(SPAM_FIXTURE));
  } finally {
    globalThis.fetch = priorFetch;
    for (const [key, value] of Object.entries(priorKeys)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("analyzeThreadWithAI quarantines obvious spam via the first configured provider", async () => {
  const priorKeys: Record<string, string | undefined> = {};
  const priorFetch = globalThis.fetch;
  for (const key of [
    "DEEPSEEK_API_KEY",
    "ANTHROPIC_API_KEY",
    "XAI_API_KEY",
    "OPENAI_API_KEY",
  ]) {
    priorKeys[key] = process.env[key];
    delete process.env[key];
  }
  // Only DeepSeek is funded, mirroring production: the other two must be skipped
  // rather than erroring the whole classification.
  process.env.DEEPSEEK_API_KEY = "sk-deepseek-test";
  const urls: string[] = [];
  globalThis.fetch = (async (url: any) => {
    urls.push(String(url));
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              // A code-fenced reply: only OpenAI honours strict json_schema, so
              // the parse must survive wrapping.
              content:
                '```json\n{"classification":"spam","status":"spam","actionTitle":"Spam","summary":"Fake support-ticket phishing asking you to confirm account details.","reason":"Cold phishing message impersonating a support desk.","confidence":0.95,"needsProject":false,"projectId":null,"taskSuggestions":[]}\n```',
            },
          },
        ],
      }),
    };
  }) as any;

  try {
    const result = await analyzeThreadWithAI(SPAM_FIXTURE);
    assert.equal(result.classification, "spam");
    assert.equal(result.status, "spam");
    assert.deepEqual(result.taskSuggestions, []);
  } finally {
    globalThis.fetch = priorFetch;
    for (const [key, value] of Object.entries(priorKeys)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  assert.deepEqual(urls, ["https://api.deepseek.com/v1/chat/completions"]);
});

test("analyzeThreadWithAI(chain: []) stays local when the org disabled AI triage", async () => {
  const priorKey = process.env.DEEPSEEK_API_KEY;
  const priorFetch = globalThis.fetch;
  process.env.DEEPSEEK_API_KEY = "sk-deepseek-test";
  globalThis.fetch = (() => {
    throw new Error("a disabled org must not make a network call");
  }) as any;

  try {
    const input = { ...SPAM_FIXTURE, chain: [] };
    const result = await analyzeThreadWithAI(input);
    assert.deepEqual(result, buildHeuristicAnalysis(input));
  } finally {
    globalThis.fetch = priorFetch;
    if (priorKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = priorKey;
  }
});
