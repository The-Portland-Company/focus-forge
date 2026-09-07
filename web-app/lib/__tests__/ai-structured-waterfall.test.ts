import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runStructuredWaterfall,
  isRecoverableProviderError,
  hasProviderKey,
  defaultModelRunner,
  type ModelSpec,
  type SingleModelRunner,
} from "../ai/structured-waterfall";
import {
  resolveChain,
  normalizeChainIds,
  defaultChainIds,
  DEFAULT_CHAIN_IDS,
} from "../ai/model-chains";

const ALL_KEYS = {
  ANTHROPIC_API_KEY: "a",
  OPENAI_API_KEY: "o",
  XAI_API_KEY: "x",
};

const CHAIN: ModelSpec[] = [
  { provider: "anthropic", model: "claude-opus-4-8" },
  { provider: "openai", model: "gpt-4.1" },
  { provider: "anthropic", model: "claude-sonnet-4-6" },
  { provider: "xai", model: "grok-3" },
];

test("waterfall falls through 1->2->3->4 on 402/insufficient-balance and returns first success + model", async () => {
  const calls: string[] = [];
  // Models 1, 2, 3 simulate balance/quota failures; model 4 succeeds.
  const runner: SingleModelRunner = async (spec) => {
    calls.push(spec.model);
    if (spec.model === "claude-opus-4-8") {
      throw new Error("anthropic request failed (402): credit balance too low");
    }
    if (spec.model === "gpt-4.1") {
      throw new Error("openai request failed (429): insufficient_quota");
    }
    if (spec.model === "claude-sonnet-4-6") {
      throw new Error("anthropic request failed (401): authentication error");
    }
    return JSON.stringify({ ok: true });
  };

  const result = await runStructuredWaterfall(
    CHAIN,
    { systemPrompt: "s", userMessage: "u" },
    { runner, env: ALL_KEYS },
  );

  assert.deepEqual(calls, [
    "claude-opus-4-8",
    "gpt-4.1",
    "claude-sonnet-4-6",
    "grok-3",
  ]);
  assert.equal(result.model, "grok-3");
  assert.equal(result.provider, "xai");
  assert.equal(result.text, JSON.stringify({ ok: true }));
});

test("waterfall returns the first model when it succeeds (no fall-through)", async () => {
  const calls: string[] = [];
  const runner: SingleModelRunner = async (spec) => {
    calls.push(spec.model);
    return "{}";
  };
  const result = await runStructuredWaterfall(
    CHAIN,
    { systemPrompt: "s", userMessage: "u" },
    { runner, env: ALL_KEYS },
  );
  assert.deepEqual(calls, ["claude-opus-4-8"]);
  assert.equal(result.model, "claude-opus-4-8");
});

test("provider-key filtering: a model whose key is missing is skipped", async () => {
  const calls: string[] = [];
  const runner: SingleModelRunner = async (spec) => {
    calls.push(spec.model);
    return "{}";
  };
  // No ANTHROPIC key -> both anthropic models skipped; OpenAI is first runnable.
  const result = await runStructuredWaterfall(
    CHAIN,
    { systemPrompt: "s", userMessage: "u" },
    { runner, env: { OPENAI_API_KEY: "o", XAI_API_KEY: "x" } },
  );
  assert.deepEqual(calls, ["gpt-4.1"]);
  assert.equal(result.model, "gpt-4.1");
});

test("waterfall throws a combined error when all models fail, preserving quota wording", async () => {
  const runner: SingleModelRunner = async () => {
    throw new Error("402 credit balance too low");
  };
  await assert.rejects(
    () =>
      runStructuredWaterfall(
        CHAIN,
        { systemPrompt: "s", userMessage: "u" },
        { runner, env: ALL_KEYS },
      ),
    /credit balance/,
  );
});

test("throws when no provider key is configured at all", async () => {
  await assert.rejects(
    () =>
      runStructuredWaterfall(
        CHAIN,
        { systemPrompt: "s", userMessage: "u" },
        { runner: async () => "{}", env: {} },
      ),
    /No AI provider configured/,
  );
});

test("isRecoverableProviderError classifies balance/quota/auth errors", () => {
  assert.equal(isRecoverableProviderError("request failed (402)"), true);
  assert.equal(isRecoverableProviderError("insufficient_quota"), true);
  assert.equal(isRecoverableProviderError("credit balance is too low"), true);
  assert.equal(isRecoverableProviderError("spending limit reached"), true);
  assert.equal(isRecoverableProviderError("rate limit exceeded"), true);
  assert.equal(isRecoverableProviderError("401 unauthorized"), true);
  assert.equal(isRecoverableProviderError("malformed request body"), false);
});

test("hasProviderKey reads the correct env var per provider", () => {
  assert.equal(hasProviderKey("anthropic", { ANTHROPIC_API_KEY: "a" }), true);
  assert.equal(hasProviderKey("openai", { OPENAI_API_KEY: "o" }), true);
  assert.equal(hasProviderKey("xai", { XAI_API_KEY: "x" }), true);
  assert.equal(hasProviderKey("anthropic", {}), false);
});

// ---- Independent estimator vs assistant chains ----

test("estimator and assistant chains resolve independently", () => {
  const chains = {
    estimator: ["gpt-4.1", "grok-3", "claude-opus-4-8", "claude-sonnet-4-6"],
    assistant: ["grok-3", "gpt-4.1", "claude-opus-4-8", "claude-sonnet-4-6"],
  };
  const estimator = resolveChain("estimator", chains);
  const assistant = resolveChain("assistant", chains);

  assert.equal(estimator[0].model, "gpt-4.1");
  assert.equal(assistant[0].model, "grok-3");
  // Changing one surface's order does not change the other.
  assert.notEqual(estimator[0].model, assistant[0].model);
});

test("changing the estimator chain does not affect the assistant default", () => {
  // Only estimator customized; assistant absent -> falls back to default order.
  const chains = {
    estimator: ["grok-3", "claude-opus-4-8", "gpt-4.1", "claude-sonnet-4-6"],
  };
  const estimator = resolveChain("estimator", chains);
  const assistant = resolveChain("assistant", chains);

  assert.equal(estimator[0].model, "grok-3");
  assert.equal(assistant[0].model, DEFAULT_CHAIN_IDS[0]); // claude-opus-4-8
});

test("resolveChain falls back to the quality-first default when chains are absent", () => {
  const chain = resolveChain("estimator", null);
  assert.deepEqual(
    chain.map((c) => c.model),
    DEFAULT_CHAIN_IDS,
  );
  assert.equal(chain[0].model, "claude-opus-4-8");
});

test("waterfall reaches the free Cloudflare fallback when every paid provider is out of credits", async () => {
  // Mirrors the real outage: Anthropic/OpenAI/xAI all report billing errors, so
  // the open CF model is the one that answers.
  const calls: string[] = [];
  const runner: SingleModelRunner = async (spec) => {
    calls.push(spec.model);
    if (spec.provider === "cf-workers-ai") return JSON.stringify({ ok: true });
    throw new Error(`${spec.provider} request failed (402): credit balance too low`);
  };
  const chain: ModelSpec[] = [
    { provider: "anthropic", model: "claude-opus-4-8" },
    { provider: "openai", model: "gpt-4.1" },
    { provider: "xai", model: "grok-3" },
    { provider: "cf-workers-ai", model: "cf-llama-3.3-70b" },
  ];
  const result = await runStructuredWaterfall(
    chain,
    { systemPrompt: "s", userMessage: "u" },
    {
      runner,
      env: { ...ALL_KEYS, CLOUDFLARE_API_TOKEN: "cf", CLOUDFLARE_ACCOUNT_ID: "acct" },
    },
  );
  assert.equal(result.provider, "cf-workers-ai");
  assert.equal(result.model, "cf-llama-3.3-70b");
  assert.equal(calls[calls.length - 1], "cf-llama-3.3-70b");
});

test("defaultModelRunner routes a CF chat model to Workers AI with no LoRA field", async () => {
  const priorFetch = globalThis.fetch;
  const priorToken = process.env.CLOUDFLARE_API_TOKEN;
  const priorAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  process.env.CLOUDFLARE_API_TOKEN = "cf-test";
  process.env.CLOUDFLARE_ACCOUNT_ID = "acct-test";

  let capturedUrl = "";
  let capturedBody: any = null;
  globalThis.fetch = (async (url: string, init?: { body?: string }) => {
    capturedUrl = String(url);
    capturedBody = JSON.parse(init?.body ?? "{}");
    return {
      ok: true,
      status: 200,
      json: async () => ({ result: { response: '{"ok":true}' } }),
      text: async () => "",
    };
  }) as unknown as typeof globalThis.fetch;

  try {
    const text = await defaultModelRunner(
      { provider: "cf-workers-ai", model: "cf-llama-3.3-70b" },
      { systemPrompt: "s", userMessage: "u" },
    );
    assert.equal(text, '{"ok":true}');
    // Hits the general chat base model, not a LoRA adapter.
    assert.match(capturedUrl, /accounts\/acct-test\/ai\/run\/@cf\/meta\/llama-3\.3-70b/);
    assert.equal("lora" in capturedBody, false);
  } finally {
    globalThis.fetch = priorFetch;
    if (priorToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = priorToken;
    if (priorAccount === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
    else process.env.CLOUDFLARE_ACCOUNT_ID = priorAccount;
  }
});

test("normalizeChainIds drops unknowns, dedupes, and back-fills omitted models", () => {
  assert.deepEqual(
    normalizeChainIds(["gpt-4.1", "bogus", "gpt-4.1"]),
    // gpt-4.1 first, then the rest of the default order back-filled (incl. the
    // terminal free CF fallback).
    ["gpt-4.1", "claude-opus-4-8", "claude-sonnet-4-6", "grok-3", "cf-llama-3.3-70b"],
  );
  assert.deepEqual(normalizeChainIds(undefined), defaultChainIds());
  assert.deepEqual(normalizeChainIds([]), defaultChainIds());
});
