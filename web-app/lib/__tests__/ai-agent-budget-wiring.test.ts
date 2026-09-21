/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { SessionBudget } from "../ai-agent/budget";
import { runAgentWithFallback } from "../ai-agent/providers";
import { checkApiTokenRateLimit } from "../api/rate-limit";

// Covers the 429 path the mobile/email/spam routes and app/api/mcp/route.ts
// now wire in: `checkApiTokenRateLimit(namespace, userId)` after auth
// resolves, returning `{ allowed: false, retryAfterMs }` once the caller is
// over the ceiling — exactly the shape each route's 429 branch checks.
test("checkApiTokenRateLimit denies with a retryAfterMs once a PAT/user exceeds the default ceiling (route 429 path)", () => {
  const store = new Map<string, number[]>();
  const now = 0;
  for (let i = 0; i < 60; i++) {
    const r = checkApiTokenRateLimit("mobile", "user-429", { now: () => now, store });
    assert.equal(r.allowed, true);
  }
  const blocked = checkApiTokenRateLimit("mobile", "user-429", { now: () => now, store });
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterMs > 0);

  // The MCP route rate-limits under a distinct "mcp" namespace so it doesn't
  // share a bucket with the mobile routes for the same user id.
  const mcpResult = checkApiTokenRateLimit("mcp", "user-429", { now: () => now, store });
  assert.equal(mcpResult.allowed, true);
});

// Covers the wiring described in the task: runAgentWithFallback should
// construct/accept one SessionBudget per turn and, once it's tripped, stop
// with a final summary rather than throwing or making another provider call.
test("runAgentWithFallback stops with a summary (not a throw) once the session budget is tripped", async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";

  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("fetch should not be called once the budget is already tripped");
  }) as typeof fetch;

  try {
    const budget = new SessionBudget({ maxTokens: 10 });
    // Trip it before the turn starts.
    budget.recordUsage({ tokens: 1000, costUsd: 0 });
    assert.equal(budget.isTripped(), true);

    const result = await runAgentWithFallback({
      systemPrompt: "test",
      conversation: [{ role: "user", content: "hi" }],
      toolContext: {
        admin: {} as any,
        userId: "user-1",
        accessibleProjectIds: new Set(),
      },
      budget,
    });

    assert.equal(fetchCalls, 0, "no provider HTTP call should be made once the budget is tripped");
    assert.match(result.assistantMessage, /stopped early|limit/i);
    assert.equal(result.provider, "budget");
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});

test("runAgentWithFallback counts a provider failover as a retry against the session budget", async () => {
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  process.env.ANTHROPIC_API_KEY = "test-key";

  const originalFetch = global.fetch;
  global.fetch = (async () => ({
    ok: false,
    status: 500,
    text: async () => "boom",
  })) as unknown as typeof fetch;

  try {
    const budget = new SessionBudget({ maxRetries: 0 });

    // The first provider attempt doesn't count as a "retry"; only failing
    // over to the next provider does. With maxRetries: 0 that failover is
    // denied, so runAgentWithFallback should stop with the budget summary
    // (not throw), after exactly one provider was actually called.
    const result = await runAgentWithFallback(
      {
        systemPrompt: "test",
        conversation: [{ role: "user", content: "hi" }],
        toolContext: {
          admin: {} as any,
          userId: "user-1",
          accessibleProjectIds: new Set(),
        },
        budget,
      },
      "openai",
    );

    assert.equal(budget.isTripped(), true);
    assert.equal(budget.snapshot().tripped, "retries");
    assert.equal(result.provider, "budget");
  } finally {
    global.fetch = originalFetch;
    if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAiKey;
    if (originalAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
  }
});
