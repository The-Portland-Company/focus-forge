import { test } from "node:test";
import assert from "node:assert/strict";

import {
  RepeatedCallGuard,
  MAX_IDENTICAL_TOOL_CALLS,
  toolCallSignature,
  buildExhaustionFallback,
  getProviderChain,
} from "../ai-agent/providers";

const DEAD_END = "I took several steps but didn't reach a clean stopping point.";

// ---- Pure units ----

test("toolCallSignature is order-independent for object args", () => {
  assert.equal(
    toolCallSignature("list_tasks", { a: 1, b: 2 }),
    toolCallSignature("list_tasks", { b: 2, a: 1 }),
  );
  assert.notEqual(
    toolCallSignature("list_tasks", { a: 1 }),
    toolCallSignature("list_tasks", { a: 2 }),
  );
});

test("RepeatedCallGuard runs up to the cap then short-circuits", () => {
  const guard = new RepeatedCallGuard();
  for (let i = 0; i < MAX_IDENTICAL_TOOL_CALLS; i += 1) {
    assert.equal(guard.consider("list_tasks", { p: 1 }).shouldRun, true);
  }
  const capped = guard.consider("list_tasks", { p: 1 });
  assert.equal(capped.shouldRun, false);
  assert.match(String(capped.cappedNote), /Do not repeat it/);
  assert.equal(guard.hitCap(), true);
});

test("buildExhaustionFallback is specific, not the generic dead-end", () => {
  const msg = buildExhaustionFallback(["list_tasks", "list_tasks"], true);
  assert.match(msg, /list_tasks/);
  assert.doesNotMatch(msg, /clean stopping point/);
});

// ---- End-to-end runner behavior with a fake model (stubbed global fetch) ----

type FetchStub = (url: string, init: any) => Promise<any>;

async function withOpenAI(stub: FetchStub, fn: () => Promise<void>) {
  const prevFetch = global.fetch;
  const prevKey = process.env.OPENAI_API_KEY;
  const prevAnthropic = process.env.ANTHROPIC_API_KEY;
  const prevXai = process.env.XAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.XAI_API_KEY;
  (global as any).fetch = (url: string, init: any) => stub(url, init);
  try {
    await fn();
  } finally {
    global.fetch = prevFetch;
    if (prevKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = prevKey;
    if (prevAnthropic !== undefined) process.env.ANTHROPIC_API_KEY = prevAnthropic;
    if (prevXai !== undefined) process.env.XAI_API_KEY = prevXai;
  }
}

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

function toolCallMessage() {
  return jsonResponse({
    choices: [
      {
        message: {
          content: null,
          tool_calls: [
            {
              id: "call_1",
              function: { name: "list_tasks", arguments: JSON.stringify({ projectId: "x" }) },
            },
          ],
        },
      },
    ],
  });
}

const openaiProvider = () => getProviderChain().find((p) => p.name === "openai")!;

const runInput = () => ({
  systemPrompt: "sys",
  conversation: [{ role: "user" as const, content: "do it" }],
  toolContext: {} as any,
});

test("(a) repeated identical tool call is capped and loop ends with a synthesized answer", async () => {
  let withTools = 0;
  let summaryCalls = 0;
  const stub: FetchStub = async (_url, init) => {
    const body = JSON.parse(init.body);
    if (body.tools) {
      // Model always requests the SAME tool call -> would loop forever.
      withTools += 1;
      return toolCallMessage();
    }
    // Tool-less final-summary request.
    summaryCalls += 1;
    return jsonResponse({
      choices: [{ message: { content: "Here is what I found: 3 tasks, but I hit a repeat." } }],
    });
  };

  await withOpenAI(stub, async () => {
    const result = await openaiProvider().run(runInput());
    assert.equal(summaryCalls, 1, "should ask the model for one final summary");
    assert.ok(withTools >= 1);
    assert.match(result.assistantMessage, /Here is what I found/);
    assert.doesNotMatch(result.assistantMessage, /clean stopping point/);
  });
});

test("(b) loop exhaustion with failing summary yields a non-generic fallback", async () => {
  const stub: FetchStub = async (_url, init) => {
    const body = JSON.parse(init.body);
    if (body.tools) return toolCallMessage();
    // Final-summary call fails -> must fall back to a SPECIFIC message.
    return { ok: false, status: 500, async text() { return "boom"; }, async json() { return {}; } };
  };

  await withOpenAI(stub, async () => {
    const result = await openaiProvider().run(runInput());
    assert.doesNotMatch(result.assistantMessage, /clean stopping point/);
    assert.doesNotMatch(result.assistantMessage, new RegExp(DEAD_END.slice(0, 20)));
    assert.match(result.assistantMessage, /list_tasks/);
  });
});

test("normal convergence is unchanged (model answers without tools)", async () => {
  const stub: FetchStub = async () =>
    jsonResponse({ choices: [{ message: { content: "All done!" } }] });
  await withOpenAI(stub, async () => {
    const result = await openaiProvider().run(runInput());
    assert.equal(result.assistantMessage, "All done!");
  });
});
