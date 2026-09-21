/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { SessionBudget } from "../ai-agent/budget";

test("SessionBudget allows usage under the token/cost ceilings", () => {
  const budget = new SessionBudget({ maxTokens: 1000, maxCostUsd: 1 });
  const result = budget.recordUsage({ tokens: 500, costUsd: 0.1 });
  assert.equal(result.allowed, true);
  assert.equal(budget.isTripped(), false);
});

test("SessionBudget trips the token ceiling and denies further usage (fail closed)", () => {
  const budget = new SessionBudget({ maxTokens: 100, maxCostUsd: 10 });
  budget.recordUsage({ tokens: 60, costUsd: 0 });
  const crossed = budget.recordUsage({ tokens: 60, costUsd: 0 });
  assert.equal(crossed.allowed, false);
  assert.equal(crossed.exceeded, "tokens");
  assert.equal(budget.isTripped(), true);

  // Even a tiny, individually-fine call is denied once tripped.
  const after = budget.recordUsage({ tokens: 1, costUsd: 0 });
  assert.equal(after.allowed, false);
  assert.equal(after.exceeded, "tokens");
});

test("SessionBudget trips the cost ceiling", () => {
  const budget = new SessionBudget({ maxTokens: 1_000_000, maxCostUsd: 1 });
  budget.recordUsage({ tokens: 1, costUsd: 0.6 });
  const crossed = budget.recordUsage({ tokens: 1, costUsd: 0.6 });
  assert.equal(crossed.allowed, false);
  assert.equal(crossed.exceeded, "cost");
});

test("SessionBudget enforces the max tool-chain depth", () => {
  const budget = new SessionBudget({ maxToolChainDepth: 2 });
  assert.equal(budget.enterToolChain().allowed, true);
  assert.equal(budget.enterToolChain().allowed, true);
  const crossed = budget.enterToolChain();
  assert.equal(crossed.allowed, false);
  assert.equal(crossed.exceeded, "tool_chain_depth");
  assert.equal(budget.isTripped(), true);
});

test("SessionBudget unwinds depth via exitToolChain without tripping when under the cap", () => {
  const budget = new SessionBudget({ maxToolChainDepth: 1 });
  assert.equal(budget.enterToolChain().allowed, true);
  budget.exitToolChain();
  assert.equal(budget.enterToolChain().allowed, true);
  assert.equal(budget.isTripped(), false);
});

test("SessionBudget enforces the retry cap", () => {
  const budget = new SessionBudget({ maxRetries: 2 });
  assert.equal(budget.recordRetry().allowed, true);
  assert.equal(budget.recordRetry().allowed, true);
  const crossed = budget.recordRetry();
  assert.equal(crossed.allowed, false);
  assert.equal(crossed.exceeded, "retries");
});

test("SessionBudget: once any ceiling trips, all other checks deny too (fail closed)", () => {
  const budget = new SessionBudget({ maxRetries: 1, maxToolChainDepth: 5, maxTokens: 5000 });
  budget.recordRetry();
  const crossed = budget.recordRetry();
  assert.equal(crossed.allowed, false);

  assert.equal(budget.enterToolChain().allowed, false);
  assert.equal(budget.recordUsage({ tokens: 1, costUsd: 0 }).allowed, false);
});

test("SessionBudget snapshot reports usage and trip state", () => {
  const budget = new SessionBudget({ maxTokens: 100 });
  budget.recordUsage({ tokens: 50, costUsd: 0.5 });
  let snap = budget.snapshot();
  assert.equal(snap.tokens, 50);
  assert.equal(snap.tripped, null);

  budget.recordUsage({ tokens: 60, costUsd: 0 });
  snap = budget.snapshot();
  assert.equal(snap.tripped, "tokens");
});
