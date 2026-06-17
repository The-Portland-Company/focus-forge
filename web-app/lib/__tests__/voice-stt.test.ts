/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import {
  getConfiguredSttProviders,
  normalizeSttPreference,
  resolveSttOrder,
  transcribeWithFallback,
  type SttProviderConfig,
} from "../voice/stt";

function makeProviders(keys: Partial<Record<"groq" | "openai", string | undefined>>): SttProviderConfig[] {
  return [
    {
      id: "groq",
      label: "Groq",
      url: "https://groq.test/transcriptions",
      model: "whisper-large-v3-turbo",
      apiKey: () => keys.groq,
    },
    {
      id: "openai",
      label: "OpenAI",
      url: "https://openai.test/transcriptions",
      model: "whisper-1",
      apiKey: () => keys.openai,
    },
  ];
}

test("getConfiguredSttProviders only includes providers with a key, preserving order", () => {
  assert.deepEqual(
    getConfiguredSttProviders(makeProviders({ groq: "g", openai: "o" })).map((p) => p.id),
    ["groq", "openai"],
  );
  assert.deepEqual(
    getConfiguredSttProviders(makeProviders({ openai: "o" })).map((p) => p.id),
    ["openai"],
  );
  assert.deepEqual(getConfiguredSttProviders(makeProviders({})).map((p) => p.id), []);
});

test("normalizeSttPreference falls back to auto for invalid input", () => {
  assert.equal(normalizeSttPreference("groq"), "groq");
  assert.equal(normalizeSttPreference("openai"), "openai");
  assert.equal(normalizeSttPreference("auto"), "auto");
  assert.equal(normalizeSttPreference("anthropic"), "auto");
  assert.equal(normalizeSttPreference(null), "auto");
  assert.equal(normalizeSttPreference(123), "auto");
});

test("resolveSttOrder keeps default order for auto", () => {
  const configured = makeProviders({ groq: "g", openai: "o" });
  assert.deepEqual(resolveSttOrder(configured, "auto").map((p) => p.id), ["groq", "openai"]);
});

test("resolveSttOrder hoists the requested provider but keeps others as fallback", () => {
  const configured = makeProviders({ groq: "g", openai: "o" });
  assert.deepEqual(resolveSttOrder(configured, "openai").map((p) => p.id), ["openai", "groq"]);
});

test("resolveSttOrder ignores a requested provider that is not configured", () => {
  const configured = getConfiguredSttProviders(makeProviders({ openai: "o" }));
  assert.deepEqual(resolveSttOrder(configured, "groq").map((p) => p.id), ["openai"]);
});

test("transcribeWithFallback throws when no provider is configured", async () => {
  await assert.rejects(
    () =>
      transcribeWithFallback({
        audio: new Blob(["x"]),
        filename: "a.webm",
        providers: makeProviders({}),
        fetchImpl: async () => new Response("{}"),
      }),
    /No speech-to-text provider configured/,
  );
});

test("transcribeWithFallback rejects empty audio", async () => {
  await assert.rejects(
    () =>
      transcribeWithFallback({
        audio: new Blob([]),
        filename: "a.webm",
        providers: makeProviders({ groq: "g" }),
        fetchImpl: async () => new Response("{}"),
      }),
    /Empty audio/,
  );
});

test("transcribeWithFallback falls through to the next provider on error", async () => {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("groq")) {
      return new Response("insufficient_quota", { status: 429 });
    }
    return new Response(JSON.stringify({ text: "hello world" }), { status: 200 });
  }) as unknown as typeof fetch;

  const result = await transcribeWithFallback({
    audio: new Blob(["x"]),
    filename: "a.webm",
    providers: makeProviders({ groq: "g", openai: "o" }),
    fetchImpl,
  });

  assert.equal(result.text, "hello world");
  assert.equal(result.provider, "openai");
  assert.equal(calls.length, 2);
});

test("transcribeWithFallback throws combined error preserving quota wording when all fail", async () => {
  const fetchImpl = (async () =>
    new Response("insufficient_quota", { status: 429 })) as unknown as typeof fetch;

  await assert.rejects(
    () =>
      transcribeWithFallback({
        audio: new Blob(["x"]),
        filename: "a.webm",
        providers: makeProviders({ groq: "g", openai: "o" }),
        fetchImpl,
      }),
    (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      assert.match(msg, /all providers/);
      assert.match(msg, /insufficient_quota/);
      return true;
    },
  );
});

test("transcribeWithFallback honors a requested provider first", async () => {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ text: "ok" }), { status: 200 });
  }) as unknown as typeof fetch;

  const result = await transcribeWithFallback({
    audio: new Blob(["x"]),
    filename: "a.webm",
    preference: "openai",
    providers: makeProviders({ groq: "g", openai: "o" }),
    fetchImpl,
  });

  assert.equal(result.provider, "openai");
  assert.match(calls[0], /openai/);
});
