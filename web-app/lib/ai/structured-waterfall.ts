/**
 * Configurable, quality-first multi-model WATERFALL for strict-JSON structured
 * completions. Builds on the per-provider HTTP logic established in
 * lib/ai-agent/providers.ts (runStructuredWithFallback) but accepts an ORDERED
 * LIST of model specs ({ provider, model }) rather than a fixed chain — so the
 * estimator and the assistant can each configure their own independent chain.
 *
 * Per-provider wire format:
 *   - OpenAI: response_format json_schema (strict) when a schema is supplied,
 *     else json_object.
 *   - xAI (OpenAI-compatible): json_object only (no reliable json_schema), rely
 *     on the prompt + defensive parsing.
 *   - Anthropic: no json_schema wire support — demand strict JSON in the system
 *     prompt and prefill the assistant turn with "{" so the model continues a
 *     JSON object. Caller parses defensively.
 *
 * Fall-through semantics: on a balance / quota / credit / insufficient-funds /
 * auth / rate-limit error (402 / 429 / 401 / insufficient_quota / "credit
 * balance" / "spending limit") we LOG and try the next model. Any other error
 * (e.g. malformed request) also falls through but is logged distinctly. A model
 * whose provider API key is missing is SKIPPED (not an error). If every model
 * fails, a combined error is thrown that preserves provider/quota wording so
 * upstream billing detection keeps working.
 */

export type WaterfallProvider = "anthropic" | "openai" | "xai";

export interface ModelSpec {
  provider: WaterfallProvider;
  model: string;
}

export interface WaterfallInput {
  systemPrompt: string;
  userMessage: string;
  /** OpenAI-style json_schema ({ name, strict, schema }). Optional. */
  jsonSchema?: Record<string, unknown>;
  temperature?: number;
}

export interface WaterfallResult {
  /** Raw text the chosen model returned (defensively parse it yourself). */
  text: string;
  /** The model that produced the result, e.g. "claude-opus-4-8". */
  model: string;
  /** The provider that produced the result. */
  provider: WaterfallProvider;
}

/** A single-model runner. Injectable for tests. */
export type SingleModelRunner = (
  spec: ModelSpec,
  input: WaterfallInput,
) => Promise<string>;

/** Returns the env var name holding the API key for a provider. */
export function apiKeyEnvVar(provider: WaterfallProvider): string {
  switch (provider) {
    case "openai":
      return "OPENAI_API_KEY";
    case "anthropic":
      return "ANTHROPIC_API_KEY";
    case "xai":
      return "XAI_API_KEY";
  }
}

/** True when a provider's API key is present in the environment. */
export function hasProviderKey(
  provider: WaterfallProvider,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(env[apiKeyEnvVar(provider)]);
}

/**
 * Classify whether an error is a balance/quota/credit/auth/rate-limit failure
 * that should fall through to the next model. We treat these as "recoverable"
 * (try the next model). Returns false for everything else.
 */
export function isRecoverableProviderError(message: string): boolean {
  const m = (message || "").toLowerCase();
  return (
    /\b(402|429|401)\b/.test(m) ||
    m.includes("insufficient_quota") ||
    m.includes("insufficient quota") ||
    m.includes("insufficient funds") ||
    m.includes("insufficient-funds") ||
    m.includes("credit balance") ||
    m.includes("credits") ||
    m.includes("spending limit") ||
    m.includes("quota") ||
    m.includes("rate limit") ||
    m.includes("rate_limit") ||
    m.includes("rate-limit") ||
    m.includes("billing") ||
    m.includes("payment") ||
    m.includes("authentication") ||
    m.includes("unauthorized") ||
    m.includes("permission")
  );
}

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const XAI_URL = "https://api.x.ai/v1/chat/completions";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

async function runOpenAICompatible(
  spec: ModelSpec,
  baseUrl: string,
  apiKey: string,
  input: WaterfallInput,
  supportsJsonSchema: boolean,
): Promise<string> {
  const responseFormat =
    input.jsonSchema && supportsJsonSchema
      ? { type: "json_schema", json_schema: input.jsonSchema }
      : { type: "json_object" };

  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: spec.model,
      temperature: input.temperature ?? 0.2,
      response_format: responseFormat,
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: input.userMessage },
      ],
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `${spec.provider} request failed (${response.status}): ${text.slice(0, 400)}`,
    );
  }
  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error(`${spec.provider}: response missing content`);
  }
  return content;
}

async function runAnthropic(
  spec: ModelSpec,
  apiKey: string,
  input: WaterfallInput,
): Promise<string> {
  // Anthropic has no json_schema response_format; demand strict JSON in the
  // system prompt and prefill the assistant turn with "{" to force a JSON
  // object start. The caller parses defensively.
  const system =
    input.systemPrompt +
    "\n\nReturn ONLY a single valid JSON object that matches the requested schema. " +
    "No prose, no markdown, no code fences.";

  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: spec.model,
      max_tokens: 4096,
      temperature: input.temperature ?? 0.2,
      system,
      messages: [
        { role: "user", content: input.userMessage },
        { role: "assistant", content: "{" },
      ],
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `anthropic request failed (${response.status}): ${text.slice(0, 400)}`,
    );
  }
  const payload = await response.json();
  const blocks: any[] = Array.isArray(payload?.content) ? payload.content : [];
  const text = blocks
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  if (!text) throw new Error("anthropic: response missing content");
  // We prefilled "{", so the model continues from there — re-prepend it.
  return "{" + text;
}

/** Default real runner that hits the provider HTTP APIs. */
export const defaultModelRunner: SingleModelRunner = async (spec, input) => {
  const apiKey = process.env[apiKeyEnvVar(spec.provider)];
  if (!apiKey) throw new Error(`${spec.provider}: not configured`);

  switch (spec.provider) {
    case "openai":
      return runOpenAICompatible(spec, OPENAI_URL, apiKey, input, true);
    case "xai":
      // xAI is OpenAI-compatible but does not reliably support json_schema.
      return runOpenAICompatible(spec, XAI_URL, apiKey, input, false);
    case "anthropic":
      return runAnthropic(spec, apiKey, input);
  }
};

export interface RunWaterfallOptions {
  /** Injectable runner (tests). Defaults to the real HTTP runner. */
  runner?: SingleModelRunner;
  /** Injectable env (tests). Defaults to process.env. */
  env?: Record<string, string | undefined>;
}

/**
 * Run the ordered model chain. The first model with a present API key is the
 * default; on a recoverable failure we fall through to the next. Skips any
 * model whose provider key is missing. Throws a combined error if all fail.
 */
export async function runStructuredWaterfall(
  chain: ModelSpec[],
  input: WaterfallInput,
  options: RunWaterfallOptions = {},
): Promise<WaterfallResult> {
  const runner = options.runner ?? defaultModelRunner;
  const env = options.env ?? process.env;

  const runnable = chain.filter((spec) => hasProviderKey(spec.provider, env));
  if (runnable.length === 0) {
    throw new Error(
      "No AI provider configured for the model chain (set OPENAI_API_KEY, ANTHROPIC_API_KEY, or XAI_API_KEY)",
    );
  }

  const errors: string[] = [];
  for (const spec of runnable) {
    try {
      const text = await runner(spec, input);
      return { text, model: spec.model, provider: spec.provider };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (isRecoverableProviderError(msg)) {
        console.warn(
          `[waterfall] ${spec.provider}/${spec.model} hit a balance/quota/auth error, falling through: ${msg}`,
        );
      } else {
        console.error(
          `[waterfall] ${spec.provider}/${spec.model} failed (non-recoverable), falling through: ${msg}`,
        );
      }
      errors.push(`${spec.provider}/${spec.model}: ${msg}`);
    }
  }

  // Preserve provider + quota wording so upstream billing detection still fires.
  throw new Error(`All AI models in the chain failed. ${errors.join(" | ")}`);
}
