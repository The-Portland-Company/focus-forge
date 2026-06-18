import { test } from "node:test";
import assert from "node:assert/strict";
import {
  apiKeyEnvVar,
  hasProviderKey,
  runStructuredWaterfall,
  type ModelSpec,
} from "../ai/structured-waterfall";
import { modelSpecFor } from "../ai/model-chains";

test("cf-workers-ai resolves to the Cloudflare token env var", () => {
  assert.equal(apiKeyEnvVar("cf-workers-ai"), "CLOUDFLARE_API_TOKEN");
});

test("registered fine-tuned model maps to the cf-workers-ai provider", () => {
  const spec = modelSpecFor("ff-estimator-gemma2b");
  assert.deepEqual(spec, {
    provider: "cf-workers-ai",
    model: "ff-estimator-gemma2b",
  });
});

test("cf model is skipped when CLOUDFLARE_API_TOKEN absent, runs frontier", async () => {
  const chain: ModelSpec[] = [
    { provider: "cf-workers-ai", model: "ff-estimator-gemma2b" },
    { provider: "openai", model: "gpt-4.1" },
  ];
  const env = { OPENAI_API_KEY: "x" }; // no CLOUDFLARE_API_TOKEN
  assert.equal(hasProviderKey("cf-workers-ai", env), false);

  const calls: string[] = [];
  const res = await runStructuredWaterfall(
    chain,
    { systemPrompt: "s", userMessage: "u" },
    {
      env,
      runner: async (spec) => {
        calls.push(spec.provider);
        return '{"minutes":30,"confidence":"high","rationale":"ok"}';
      },
    },
  );
  assert.deepEqual(calls, ["openai"]); // cf skipped (no key)
  assert.equal(res.provider, "openai");
});

test("cf model runs first when its token is present", async () => {
  const chain: ModelSpec[] = [
    { provider: "cf-workers-ai", model: "ff-estimator-gemma2b" },
    { provider: "openai", model: "gpt-4.1" },
  ];
  const env = { CLOUDFLARE_API_TOKEN: "t", OPENAI_API_KEY: "x" };
  const calls: string[] = [];
  const res = await runStructuredWaterfall(
    chain,
    { systemPrompt: "s", userMessage: "u" },
    {
      env,
      runner: async (spec) => {
        calls.push(spec.provider);
        return '{"minutes":42,"confidence":"high","rationale":"ok"}';
      },
    },
  );
  assert.equal(calls[0], "cf-workers-ai");
  assert.equal(res.provider, "cf-workers-ai");
});
