/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { parsePlannerJson } from "../daily-plan/server";

const obj = { orderedItems: [{ id: "a", rank: 1 }], deferred: [], estimatesProposed: [] };

test("parses clean JSON (OpenAI/xAI json mode)", () => {
  assert.deepEqual(parsePlannerJson(JSON.stringify(obj)), obj);
});

test("parses JSON wrapped in a ```json code fence", () => {
  const raw = "```json\n" + JSON.stringify(obj) + "\n```";
  assert.deepEqual(parsePlannerJson(raw), obj);
});

test("parses JSON wrapped in a bare ``` fence", () => {
  const raw = "```\n" + JSON.stringify(obj) + "\n```";
  assert.deepEqual(parsePlannerJson(raw), obj);
});

test("extracts the first balanced object from surrounding prose", () => {
  const raw = `Here is your plan:\n${JSON.stringify(obj)}\nLet me know!`;
  assert.deepEqual(parsePlannerJson(raw), obj);
});

test("handles braces inside string values", () => {
  const tricky = { rationale: "use {curly} braces } here", orderedItems: [] };
  const raw = `prose ${JSON.stringify(tricky)} trailing`;
  assert.deepEqual(parsePlannerJson(raw), tricky);
});

test("supports Anthropic prefill style (leading brace already present)", () => {
  // Provider re-prepends the prefilled "{"; result is plain JSON.
  assert.deepEqual(parsePlannerJson("{" + JSON.stringify(obj).slice(1)), obj);
});

test("throws on empty content", () => {
  assert.throws(() => parsePlannerJson(""), /empty content/);
});

test("throws on unparseable content", () => {
  assert.throws(() => parsePlannerJson("not json at all"), /invalid JSON/);
});
