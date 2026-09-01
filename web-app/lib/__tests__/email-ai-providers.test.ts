import { test } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeOrgAISettings,
  resolveEmailChain,
} from "../ai/email-provider";
import {
  DEFAULT_EMAIL_CHAIN_IDS,
  EMAIL_SELECTABLE_IDS,
  modelLabel,
  modelsForSurface,
  normalizeChainIds,
} from "../ai/model-chains";
import {
  DEFAULT_MAX_TOKENS,
  apiKeyEnvVar,
  defaultModelRunner,
  hasProviderKey,
  runStructuredWaterfall,
} from "../ai/structured-waterfall";
import { analyzeThreadWithAI, buildHeuristicAnalysis } from "../email-inbox/ai";

// The email chain leads with DeepSeek deliberately: it is the highest-volume AI
// surface and the cheapest provider of the three. V4 Flash is the current
// generation's economical model, which is the right trade for triage volume.
test("the default email chain is DeepSeek V4 Flash -> Claude -> Grok -> free CF fallback", () => {
  assert.deepEqual(DEFAULT_EMAIL_CHAIN_IDS, [
    "deepseek-v4-flash",
    "claude-opus-4-8",
    "grok-3",
    "cf-llama-3.3-70b",
  ]);
});

// The user must be able to CHOOSE the DeepSeek variant, so the email surface
// offers more models than the default chain contains — each labelled with its
// version so V4 Flash, V4 Pro and the legacy V3 alias are distinguishable.
test("the email surface offers both V4 models plus the legacy V3 alias", () => {
  const models = modelsForSurface("email");
  assert.deepEqual(
    models.map((m) => m.id),
    EMAIL_SELECTABLE_IDS,
  );
  assert.equal(modelLabel("deepseek-v4-flash"), "DeepSeek V4 Flash (DeepSeek)");
  assert.equal(modelLabel("deepseek-v4-pro"), "DeepSeek V4 Pro (DeepSeek)");
  assert.equal(modelLabel("deepseek-chat"), "DeepSeek V3 Chat — legacy (DeepSeek)");
  // Estimator-only models stay out of the email picker.
  assert.ok(!models.some((m) => m.id === "ff-estimator-gemma2b"));
});

test("resolveEmailChain defaults to the DeepSeek-V4-first chain when unset", () => {
  assert.deepEqual(resolveEmailChain(null), [
    { provider: "deepseek", model: "deepseek-v4-flash" },
    { provider: "anthropic", model: "claude-opus-4-8" },
    { provider: "xai", model: "grok-3" },
    { provider: "cf-workers-ai", model: "cf-llama-3.3-70b" },
  ]);
  assert.deepEqual(resolveEmailChain({}), resolveEmailChain(null));
});

test("resolveEmailChain honours an org's stored order", () => {
  const chain = resolveEmailChain({
    email: { enabled: true, chain: ["grok-3", "deepseek-v4-flash"] },
  });
  assert.deepEqual(
    chain.map((spec) => spec.model),
    // The omitted models are appended in default order, never dropped.
    ["grok-3", "deepseek-v4-flash", "claude-opus-4-8", "cf-llama-3.3-70b"],
  );
});

// An org that stored the legacy V3 alias before the V4 upgrade must keep
// resolving — its choice leads, and the new default is appended behind it.
test("resolveEmailChain still resolves a chain pinned to the legacy V3 alias", () => {
  const chain = resolveEmailChain({
    email: { enabled: true, chain: ["deepseek-chat"] },
  });
  assert.deepEqual(
    chain.map((spec) => spec.model),
    [
      "deepseek-chat",
      "deepseek-v4-flash",
      "claude-opus-4-8",
      "grok-3",
      "cf-llama-3.3-70b",
    ],
  );
});

test("resolveEmailChain lets an org pin DeepSeek V4 Pro first", () => {
  const chain = resolveEmailChain({
    email: { enabled: true, chain: ["deepseek-v4-pro"] },
  });
  assert.equal(chain[0]?.model, "deepseek-v4-pro");
  assert.equal(chain[0]?.provider, "deepseek");
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
    "deepseek-v4-flash",
    "claude-opus-4-8",
    "cf-llama-3.3-70b",
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

test("deepseek V4 posts an OpenAI-compatible json_object request with reasoning headroom", async () => {
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
      { provider: "deepseek", model: "deepseek-v4-flash" },
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
  assert.equal(body.model, "deepseek-v4-flash");
  assert.deepEqual(body.response_format, { type: "json_object" });
  // V4 is a hybrid reasoner: without an explicit budget the thinking can eat
  // the whole default allowance and `message.content` comes back empty.
  assert.equal(body.max_tokens, DEFAULT_MAX_TOKENS);
  assert.ok(body.max_tokens >= 2048);
});

// A V4 reply carries BOTH reasoning_content (thinking) and content (the JSON
// answer). The waterfall must read `content` and ignore the reasoning.
test("runStructuredWaterfall reads content, not reasoning_content, from a V4 reply", async () => {
  const priorKey = process.env.DEEPSEEK_API_KEY;
  const priorFetch = globalThis.fetch;
  process.env.DEEPSEEK_API_KEY = "sk-deepseek-test";
  globalThis.fetch = (async () => ({
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            reasoning_content:
              "The sender domain does not match the support desk it claims...",
            content: '{"classification":"spam","confidence":0.95}',
          },
        },
      ],
    }),
  })) as any;

  try {
    const result = await runStructuredWaterfall(resolveEmailChain(null), {
      systemPrompt: "classify",
      userMessage: SPAM_FIXTURE.subject,
    });
    assert.equal(result.model, "deepseek-v4-flash");
    assert.equal(result.provider, "deepseek");
    assert.deepEqual(JSON.parse(result.text), {
      classification: "spam",
      confidence: 0.95,
    });
    assert.ok(!result.text.includes("support desk it claims"));
  } finally {
    globalThis.fetch = priorFetch;
    if (priorKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = priorKey;
  }
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
  const models: string[] = [];
  globalThis.fetch = (async (url: any, init: any) => {
    urls.push(String(url));
    models.push(JSON.parse(init.body).model);
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              // V4 is a hybrid reasoner, so a real reply carries the thinking
              // alongside the answer. Only the answer may be parsed.
              reasoning_content:
                "Impersonates a support desk and asks for account details.",
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
    // AI-detected spam is routed to QUARANTINE (reviewable), not the spam
    // bucket, even when the model returns status:"spam".
    assert.equal(result.status, "quarantine");
    assert.deepEqual(result.taskSuggestions, []);
  } finally {
    globalThis.fetch = priorFetch;
    for (const [key, value] of Object.entries(priorKeys)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  assert.deepEqual(urls, ["https://api.deepseek.com/v1/chat/completions"]);
  // The org has no stored chain, so triage must run on the shipped default.
  assert.deepEqual(models, ["deepseek-v4-flash"]);
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
