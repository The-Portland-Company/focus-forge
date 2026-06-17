import { test } from "node:test";
import assert from "node:assert/strict";

import {
  runStructuredWaterfall,
  isRecoverableProviderError,
  hasProviderKey,
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

test("normalizeChainIds drops unknowns, dedupes, and back-fills omitted models", () => {
  assert.deepEqual(
    normalizeChainIds(["gpt-4.1", "bogus", "gpt-4.1"]),
    // gpt-4.1 first, then the rest of the default order back-filled.
    ["gpt-4.1", "claude-opus-4-8", "claude-sonnet-4-6", "grok-3"],
  );
  assert.deepEqual(normalizeChainIds(undefined), defaultChainIds());
  assert.deepEqual(normalizeChainIds([]), defaultChainIds());
});
