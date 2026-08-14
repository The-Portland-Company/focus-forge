/**
 * Live status + credit balance for the LLM providers this deployment uses.
 *
 * Honesty rule for this module: we only ever report a dollar balance a provider
 * actually hands us. Today that is DeepSeek alone —
 * `GET https://api.deepseek.com/user/balance` returns a real USD figure.
 * Anthropic, OpenAI, xAI and Cloudflare expose NO public account-balance
 * endpoint, so for those we report a *status* derived from a cheap live probe
 * and leave balanceUsd null with a note saying the provider does not expose it.
 * We never estimate, extrapolate, or invent a balance.
 *
 * The pure classifiers (classifyProbeFailure, parseDeepSeekBalance) are exported
 * so they can be unit-tested without touching the network.
 */

import { KNOWN_MODELS } from "./model-chains";
import { apiKeyEnvVar, hasProviderKey } from "./structured-waterfall";
import type { WaterfallProvider } from "./structured-waterfall";

export type LlmProviderStatus =
  | "ok"
  | "out_of_credit"
  | "error"
  | "unconfigured";

export interface LlmProviderInfo {
  /** Stable id (same value as `provider`; kept explicit for the UI's keying). */
  id: WaterfallProvider;
  label: string;
  provider: WaterfallProvider;
  /** The model ids in our registry served by this provider. */
  models: string[];
  /** Env var that holds this provider's key (name only — never the value). */
  envVar: string;
  configured: boolean;
  status: LlmProviderStatus;
  /** Real USD balance, or null when the provider does not expose one. */
  balanceUsd: number | null;
  /** Why balanceUsd is null, or the currency detail when it is not. */
  balanceNote: string | null;
  /** Short human-readable reason behind `status` (never contains the key). */
  statusNote: string | null;
  /** ISO timestamp of the probe that produced this row. */
  checkedAt: string;
}

const PROVIDER_LABELS: Record<WaterfallProvider, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI",
  xai: "xAI (Grok)",
  deepseek: "DeepSeek",
  "cf-workers-ai": "Cloudflare Workers AI",
};

/**
 * The model each provider is probed with: the cheapest registry model we have
 * for that vendor, called with max_tokens 1 so a probe costs ~nothing.
 */
const PROBE_MODELS: Partial<Record<WaterfallProvider, string>> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4.1",
  xai: "grok-3",
  deepseek: "deepseek-chat",
};

/** Display order: the providers actually in the email/estimator chains first. */
const PROVIDER_ORDER: WaterfallProvider[] = [
  "deepseek",
  "anthropic",
  "xai",
  "openai",
  "cf-workers-ai",
];

export const BALANCE_NOT_EXPOSED = "not exposed by provider";

/** The providers in use, derived from the model registry (never hardcoded). */
export function providersInUse(): Array<{
  provider: WaterfallProvider;
  models: string[];
}> {
  const byProvider = new Map<WaterfallProvider, string[]>();
  for (const model of KNOWN_MODELS) {
    const list = byProvider.get(model.provider) ?? [];
    list.push(model.id);
    byProvider.set(model.provider, list);
  }
  return PROVIDER_ORDER.filter((p) => byProvider.has(p)).map((provider) => ({
    provider,
    models: byProvider.get(provider) ?? [],
  }));
}

export function providerLabel(provider: WaterfallProvider): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

/**
 * Classify a failed probe. `out_of_credit` is deliberately NARROWER than
 * structured-waterfall's isRecoverableProviderError: a bad key or a plain rate
 * limit is an `error`, not an empty wallet. The matched phrases are the real
 * ones the four vendors return (verified against live responses):
 *   anthropic 400 "Your credit balance is too low to access the Anthropic API"
 *   xai       403 "has either used all available credits or reached its
 *                  monthly spending limit"
 *   openai    429 "You have no credits remaining" / insufficient_quota
 */
export function classifyProbeFailure(
  httpStatus: number,
  body: string,
): { status: Exclude<LlmProviderStatus, "unconfigured">; statusNote: string } {
  const text = (body || "").toLowerCase();
  const creditPhrases = [
    "credit balance is too low",
    "credit_balance_exhausted",
    "no credits remaining",
    "used all available credits",
    "monthly spending limit",
    "spending limit",
    "insufficient_quota",
    "insufficient quota",
    "insufficient funds",
    "insufficient balance",
    "exceeded your current quota",
    "billing",
    "purchase more credits",
    "add credits",
  ];
  const isCredit =
    httpStatus === 402 || creditPhrases.some((phrase) => text.includes(phrase));
  return {
    status: isCredit ? "out_of_credit" : "error",
    statusNote: summarizeFailure(httpStatus, body),
  };
}

/** A one-line, key-free summary of a failure body for the UI. */
export function summarizeFailure(httpStatus: number, body: string): string {
  let message = (body || "").trim();
  try {
    const parsed = JSON.parse(message);
    message =
      parsed?.error?.message ??
      parsed?.error ??
      parsed?.message ??
      parsed?.detail ??
      message;
    if (typeof message !== "string") message = JSON.stringify(message);
  } catch {
    // Not JSON — fall through with the raw text.
  }
  const trimmed = message.replace(/\s+/g, " ").slice(0, 220);
  return httpStatus > 0 ? `HTTP ${httpStatus}: ${trimmed}` : trimmed;
}

/**
 * Parse `GET https://api.deepseek.com/user/balance`. Shape:
 *   { is_available: true,
 *     balance_infos: [{ currency: "USD", total_balance: "24.10", ... }] }
 * Returns null when the payload does not carry a USD figure we can trust.
 */
export function parseDeepSeekBalance(payload: unknown): {
  balanceUsd: number | null;
  isAvailable: boolean;
  currency: string | null;
} {
  const doc =
    payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const isAvailable = doc.is_available === true;
  const infos = Array.isArray(doc.balance_infos) ? doc.balance_infos : [];
  const usd =
    infos.find(
      (info) =>
        info &&
        typeof info === "object" &&
        String((info as Record<string, unknown>).currency).toUpperCase() === "USD",
    ) ?? infos[0];
  if (!usd || typeof usd !== "object") {
    return { balanceUsd: null, isAvailable, currency: null };
  }
  const raw = (usd as Record<string, unknown>).total_balance;
  const parsed = typeof raw === "number" ? raw : Number.parseFloat(String(raw));
  return {
    balanceUsd: Number.isFinite(parsed) ? parsed : null,
    isAvailable,
    currency: String((usd as Record<string, unknown>).currency ?? "USD"),
  };
}

const PROBE_TIMEOUT_MS = 8000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
): Promise<{ httpStatus: number; body: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return { httpStatus: response.status, body: await response.text() };
  } finally {
    clearTimeout(timer);
  }
}

/** DeepSeek is the one provider with a real balance endpoint. */
async function probeDeepSeek(apiKey: string): Promise<Partial<LlmProviderInfo>> {
  const { httpStatus, body } = await fetchWithTimeout(
    "https://api.deepseek.com/user/balance",
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  if (httpStatus < 200 || httpStatus >= 300) {
    const failure = classifyProbeFailure(httpStatus, body);
    return { ...failure, balanceUsd: null, balanceNote: null };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return {
      status: "error",
      statusNote: "balance endpoint returned a non-JSON body",
      balanceUsd: null,
      balanceNote: null,
    };
  }
  const { balanceUsd, isAvailable, currency } = parseDeepSeekBalance(payload);
  return {
    status: isAvailable ? "ok" : "out_of_credit",
    statusNote: isAvailable ? null : "provider reports the account is unavailable",
    balanceUsd,
    balanceNote: balanceUsd === null ? "balance not returned" : (currency ?? "USD"),
  };
}

/** Anthropic: one-token /v1/messages call. */
async function probeAnthropic(apiKey: string): Promise<Partial<LlmProviderInfo>> {
  const { httpStatus, body } = await fetchWithTimeout(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: PROBE_MODELS.anthropic,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
    },
  );
  return httpStatus >= 200 && httpStatus < 300
    ? { status: "ok", statusNote: null }
    : classifyProbeFailure(httpStatus, body);
}

/** OpenAI-compatible one-token chat completion (OpenAI, xAI). */
async function probeOpenAICompatible(
  url: string,
  model: string,
  apiKey: string,
): Promise<Partial<LlmProviderInfo>> {
  const { httpStatus, body } = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    }),
  });
  return httpStatus >= 200 && httpStatus < 300
    ? { status: "ok", statusNote: null }
    : classifyProbeFailure(httpStatus, body);
}

/**
 * Cloudflare Workers AI: no chat probe (our only model there is a LoRA adapter
 * that would cost a real inference). A models-list call proves the token and
 * account are valid, which is all we claim.
 */
async function probeCloudflare(
  apiKey: string,
  accountId: string,
): Promise<Partial<LlmProviderInfo>> {
  const { httpStatus, body } = await fetchWithTimeout(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search?per_page=1`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  return httpStatus >= 200 && httpStatus < 300
    ? { status: "ok", statusNote: null }
    : classifyProbeFailure(httpStatus, body);
}

async function probeProvider(
  provider: WaterfallProvider,
  env: Record<string, string | undefined>,
): Promise<Partial<LlmProviderInfo>> {
  const apiKey = env[apiKeyEnvVar(provider)];
  if (!apiKey) {
    return {
      status: "unconfigured",
      statusNote: `${apiKeyEnvVar(provider)} is not set on this deployment`,
    };
  }
  switch (provider) {
    case "deepseek":
      return probeDeepSeek(apiKey);
    case "anthropic":
      return probeAnthropic(apiKey);
    case "openai":
      return probeOpenAICompatible(
        "https://api.openai.com/v1/chat/completions",
        PROBE_MODELS.openai as string,
        apiKey,
      );
    case "xai":
      return probeOpenAICompatible(
        "https://api.x.ai/v1/chat/completions",
        PROBE_MODELS.xai as string,
        apiKey,
      );
    case "cf-workers-ai": {
      const accountId = env.CLOUDFLARE_ACCOUNT_ID;
      if (!accountId) {
        return {
          status: "unconfigured",
          statusNote: "CLOUDFLARE_ACCOUNT_ID is not set on this deployment",
        };
      }
      return probeCloudflare(apiKey, accountId);
    }
  }
}

/** In-memory, per-provider probe cache so page loads don't hammer the vendors. */
const CACHE_TTL_MS = 60_000;
const cache = new Map<WaterfallProvider, { expiresAt: number; row: LlmProviderInfo }>();

/** Test/refresh hook: drop every cached probe. */
export function clearProviderStatusCache(): void {
  cache.clear();
}

/**
 * Probe every provider in use (in parallel), honouring the 60s cache unless
 * `force` is set. A probe that throws (timeout, DNS, TLS) becomes status
 * "error" — never a silent "ok".
 */
export async function getProviderStatuses(options?: {
  force?: boolean;
  env?: Record<string, string | undefined>;
}): Promise<LlmProviderInfo[]> {
  const env = options?.env ?? process.env;
  const now = Date.now();

  return Promise.all(
    providersInUse().map(async ({ provider, models }) => {
      const cached = cache.get(provider);
      if (!options?.force && cached && cached.expiresAt > now) return cached.row;

      const base: LlmProviderInfo = {
        id: provider,
        label: providerLabel(provider),
        provider,
        models,
        envVar: apiKeyEnvVar(provider),
        configured: hasProviderKey(provider, env),
        status: "error",
        balanceUsd: null,
        // Overwritten by the DeepSeek branch, which does expose a balance.
        balanceNote: BALANCE_NOT_EXPOSED,
        statusNote: null,
        checkedAt: new Date().toISOString(),
      };

      let probed: Partial<LlmProviderInfo>;
      try {
        probed = await probeProvider(provider, env);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        probed = {
          status: "error",
          statusNote:
            message.includes("abort") || message.includes("Abort")
              ? `probe timed out after ${PROBE_TIMEOUT_MS}ms`
              : summarizeFailure(0, message),
        };
      }

      const row: LlmProviderInfo = { ...base, ...probed };
      cache.set(provider, { expiresAt: Date.now() + CACHE_TTL_MS, row });
      return row;
    }),
  );
}
