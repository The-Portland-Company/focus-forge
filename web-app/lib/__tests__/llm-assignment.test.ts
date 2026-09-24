/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeLlmAssignment,
  isLlmEffort,
  LLM_EFFORT_LEVELS,
} from "../llm/assignment";

test("effort levels are the four documented values", () => {
  assert.deepEqual([...LLM_EFFORT_LEVELS], ["low", "medium", "high", "max"]);
  assert.ok(isLlmEffort("max"));
  assert.ok(!isLlmEffort("ultra"));
  assert.ok(!isLlmEffort(3));
});

test("normalizes provider + effort to lowercase, keeps model case, blanks -> null", () => {
  const out = normalizeLlmAssignment({
    llm_provider: " Anthropic ",
    llm_model: " claude-Sonnet-5 ",
    llm_effort: "HIGH",
  });
  assert.deepEqual(out, {
    llm_provider: "anthropic",
    llm_model: "claude-Sonnet-5",
    llm_effort: "high",
  });
  assert.deepEqual(normalizeLlmAssignment({ llm_provider: "", llm_model: "  ", llm_effort: null }), {
    llm_provider: null,
    llm_model: null,
    llm_effort: null,
  });
});

test("leaves undefined fields undefined so PATCH does not clear them", () => {
  const out = normalizeLlmAssignment({ llm_model: "gpt-5" });
  assert.equal(out.llm_provider, undefined);
  assert.equal(out.llm_effort, undefined);
  assert.equal(out.llm_model, "gpt-5");
});

test("rejects an unknown effort level", () => {
  assert.throws(() => normalizeLlmAssignment({ llm_effort: "extreme" }), /Invalid llm_effort/);
});
