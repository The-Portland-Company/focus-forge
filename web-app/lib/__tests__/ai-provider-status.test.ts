import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BALANCE_NOT_EXPOSED,
  classifyProbeFailure,
  clearProviderStatusCache,
  getProviderStatuses,
  parseDeepSeekBalance,
  providersInUse,
  summarizeFailure,
} from "../ai/provider-status";

/**
 * The real error bodies the four vendors returned when probed on 2026-08-14.
 * These are the strings the classifier must recognise as "out of credit".
 */
const REAL_CREDIT_ERRORS: Array<[string, number, string]> = [
  [
    "anthropic",
    400,
    '{"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}',
  ],
  [
    "xai",
    403,
    '{"code":"permission-denied","error":"Your team fbd513ab has either used all available credits or reached its monthly spending limit. To continue making API requests, please purchase more credits or raise your spending limit."}',
  ],
  [
    "openai",
    429,
    '{"error":{"message":"You have no credits remaining. Add credits to continue using the API.","type":"insufficient_quota","code":"credit_balance_exhausted"}}',
  ],
];

test("classifyProbeFailure maps real vendor credit errors to out_of_credit", () => {
  for (const [vendor, httpStatus, body] of REAL_CREDIT_ERRORS) {
    const result = classifyProbeFailure(httpStatus, body);
    assert.equal(result.status, "out_of_credit", `${vendor} misclassified`);
    assert.ok(result.statusNote.length > 0);
  }
});

test("classifyProbeFailure treats a bare 402 as out_of_credit", () => {
  assert.equal(classifyProbeFailure(402, "Payment Required").status, "out_of_credit");
});

test("classifyProbeFailure does NOT call a bad key or a rate limit out_of_credit", () => {
  assert.equal(
    classifyProbeFailure(
      401,
      '{"error":{"message":"Incorrect API key provided.","type":"invalid_request_error"}}',
    ).status,
    "error",
  );
  assert.equal(
    classifyProbeFailure(
      429,
      '{"error":{"message":"Rate limit reached for requests. Please try again in 20s.","type":"requests"}}',
    ).status,
    "error",
  );
  assert.equal(classifyProbeFailure(500, "internal server error").status, "error");
});

test("summarizeFailure extracts the vendor message and never returns the raw blob", () => {
  const note = summarizeFailure(
    400,
    '{"error":{"message":"Your credit balance is too low to access the Anthropic API."}}',
  );
  assert.equal(
    note,
    "HTTP 400: Your credit balance is too low to access the Anthropic API.",
  );
  assert.ok(summarizeFailure(0, "fetch failed").length > 0);
});

test("parseDeepSeekBalance reads the real balance payload", () => {
  const parsed = parseDeepSeekBalance({
    is_available: true,
    balance_infos: [
      {
        currency: "USD",
        total_balance: "24.10",
        granted_balance: "0.00",
        topped_up_balance: "24.10",
      },
    ],
  });
  assert.equal(parsed.balanceUsd, 24.1);
  assert.equal(parsed.isAvailable, true);
  assert.equal(parsed.currency, "USD");
});

test("parseDeepSeekBalance prefers the USD row and tolerates junk", () => {
  const multi = parseDeepSeekBalance({
    is_available: false,
    balance_infos: [
      { currency: "CNY", total_balance: "9.00" },
      { currency: "USD", total_balance: "0.00" },
    ],
  });
  assert.equal(multi.balanceUsd, 0);
  assert.equal(multi.isAvailable, false);

  assert.deepEqual(parseDeepSeekBalance({}), {
    balanceUsd: null,
    isAvailable: false,
    currency: null,
  });
  assert.equal(parseDeepSeekBalance(null).balanceUsd, null);
  assert.equal(
    parseDeepSeekBalance({ is_available: true, balance_infos: [{ currency: "USD" }] })
      .balanceUsd,
    null,
  );
});

test("providersInUse is derived from the model registry", () => {
  const providers = providersInUse();
  const ids = providers.map((p) => p.provider);
  assert.ok(ids.includes("deepseek"));
  assert.ok(ids.includes("anthropic"));
  assert.ok(ids.includes("xai"));
  assert.equal(ids[0], "deepseek", "DeepSeek leads the email chain, so it lists first");
  const anthropic = providers.find((p) => p.provider === "anthropic");
  assert.ok(anthropic && anthropic.models.includes("claude-opus-4-8"));
  // The DeepSeek row must advertise the CURRENT generation, not just the
  // legacy V3 alias, so the LLM Providers panel shows the model actually used.
  const deepseek = providers.find((p) => p.provider === "deepseek");
  assert.ok(deepseek);
  assert.ok(deepseek.models.includes("deepseek-v4-flash"));
  assert.ok(deepseek.models.includes("deepseek-v4-pro"));
  assert.ok(deepseek.models.includes("deepseek-chat"));
});

// --- getProviderStatuses, with fetch mocked ------------------------------

type FetchLike = typeof globalThis.fetch;

function mockFetch(handler: (url: string) => { status: number; body: string }) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: any) => {
    const url = typeof input === "string" ? input : String(input?.url ?? input);
    const { status, body } = handler(url);
    return {
      status,
      ok: status >= 200 && status < 300,
      text: async () => body,
    } as any;
  }) as FetchLike;
  return () => {
    globalThis.fetch = original;
  };
}

const ENV_ALL = {
  DEEPSEEK_API_KEY: "d",
  ANTHROPIC_API_KEY: "a",
  XAI_API_KEY: "x",
  OPENAI_API_KEY: "o",
};

test("getProviderStatuses reports a real DeepSeek balance and honest peer status", async () => {
  clearProviderStatusCache();
  const restore = mockFetch((url) => {
    if (url.includes("api.deepseek.com/user/balance")) {
      return {
        status: 200,
        body: JSON.stringify({
          is_available: true,
          balance_infos: [{ currency: "USD", total_balance: "24.10" }],
        }),
      };
    }
    if (url.includes("api.anthropic.com")) return { status: 400, body: REAL_CREDIT_ERRORS[0][2] };
    if (url.includes("api.x.ai")) return { status: 403, body: REAL_CREDIT_ERRORS[1][2] };
    if (url.includes("api.openai.com")) return { status: 429, body: REAL_CREDIT_ERRORS[2][2] };
    return { status: 200, body: "{}" };
  });

  try {
    const rows = await getProviderStatuses({ force: true, env: ENV_ALL });
    const by = Object.fromEntries(rows.map((r) => [r.provider, r]));

    assert.equal(by.deepseek.status, "ok");
    assert.equal(by.deepseek.balanceUsd, 24.1);
    assert.equal(by.deepseek.configured, true);

    for (const id of ["anthropic", "xai", "openai"]) {
      assert.equal(by[id].status, "out_of_credit", `${id} status`);
      assert.equal(by[id].balanceUsd, null, `${id} must not invent a balance`);
      assert.equal(by[id].balanceNote, BALANCE_NOT_EXPOSED, `${id} balance note`);
    }
  } finally {
    restore();
  }
});

test("getProviderStatuses reports unconfigured providers without probing them", async () => {
  clearProviderStatusCache();
  let calls = 0;
  const restore = mockFetch(() => {
    calls += 1;
    return { status: 200, body: "{}" };
  });

  try {
    const rows = await getProviderStatuses({ force: true, env: {} });
    assert.ok(rows.length > 0);
    for (const row of rows) {
      assert.equal(row.status, "unconfigured", `${row.provider} status`);
      assert.equal(row.configured, false);
      assert.equal(row.balanceUsd, null);
      assert.ok(row.statusNote?.includes(row.envVar) || row.statusNote?.includes("CLOUDFLARE"));
    }
    assert.equal(calls, 0, "an unconfigured provider must not be probed");
  } finally {
    restore();
  }
});

test("getProviderStatuses turns a thrown probe into error, never ok", async () => {
  clearProviderStatusCache();
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("fetch failed: ETIMEDOUT");
  }) as FetchLike;

  try {
    const rows = await getProviderStatuses({ force: true, env: ENV_ALL });
    const deepseek = rows.find((r) => r.provider === "deepseek");
    assert.equal(deepseek?.status, "error");
    assert.equal(deepseek?.balanceUsd, null);
  } finally {
    globalThis.fetch = original;
  }
});

test("getProviderStatuses caches probes for 60s unless forced", async () => {
  clearProviderStatusCache();
  let calls = 0;
  const restore = mockFetch((url) => {
    calls += 1;
    if (url.includes("user/balance")) {
      return {
        status: 200,
        body: JSON.stringify({
          is_available: true,
          balance_infos: [{ currency: "USD", total_balance: "1.00" }],
        }),
      };
    }
    return { status: 200, body: "{}" };
  });

  try {
    await getProviderStatuses({ force: true, env: ENV_ALL });
    const afterFirst = calls;
    assert.ok(afterFirst > 0);
    await getProviderStatuses({ env: ENV_ALL });
    assert.equal(calls, afterFirst, "second call must be served from cache");
    await getProviderStatuses({ force: true, env: ENV_ALL });
    assert.ok(calls > afterFirst, "force must re-probe");
  } finally {
    restore();
    clearProviderStatusCache();
  }
});
