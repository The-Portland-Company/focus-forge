/**
 * Multi-provider speech-to-text (STT) with a fallback chain.
 *
 * Mirrors the spirit of lib/ai-agent/providers.ts (runStructuredWithFallback):
 * a small ordered list of providers, try each in order, fall through on any
 * error (quota/429/insufficient_quota/outage), collect per-provider error
 * messages, and throw a combined error preserving provider/quota wording if all
 * fail (so any UI billing detection still fires).
 *
 * Real STT providers: both Groq and OpenAI expose the OpenAI-compatible
 * /audio/transcriptions endpoint. Groq (Whisper-large-v3-turbo) is preferred —
 * fast/cheap and keeps voice working when the OpenAI account is out of quota;
 * OpenAI Whisper (whisper-1) is the fallback.
 *
 * NOTE: xAI/Grok and Anthropic do NOT currently offer a speech-to-text API, so
 * there are intentionally no STT entries for them here. Adding another real STT
 * provider is trivial: append a STT_PROVIDERS entry with its url/model/key.
 */

export type SttProviderId = "groq" | "openai";

export interface SttProviderConfig {
  id: SttProviderId;
  label: string;
  url: string;
  model: string;
  /** Reads the API key from the environment at call time. */
  apiKey: () => string | undefined;
}

/** Default provider order (most preferred first). */
export const STT_PROVIDERS: SttProviderConfig[] = [
  {
    id: "groq",
    label: "Groq Whisper v3 Turbo",
    url: "https://api.groq.com/openai/v1/audio/transcriptions",
    model: "whisper-large-v3-turbo",
    apiKey: () => process.env.GROQ_API_KEY,
  },
  {
    id: "openai",
    label: "OpenAI Whisper",
    url: "https://api.openai.com/v1/audio/transcriptions",
    model: "whisper-1",
    apiKey: () => process.env.OPENAI_API_KEY,
  },
];

/** Options surfaced to the client chooser. "auto" = use the default order. */
export const STT_PROVIDER_OPTIONS = [
  { id: "auto", label: "Auto (fallback)" },
  { id: "groq", label: "Groq Whisper v3 Turbo" },
  { id: "openai", label: "OpenAI Whisper" },
] as const;

export type SttProviderPreference = (typeof STT_PROVIDER_OPTIONS)[number]["id"];

/** Returns the providers whose API key is configured, preserving order. */
export function getConfiguredSttProviders(
  providers: SttProviderConfig[] = STT_PROVIDERS,
): SttProviderConfig[] {
  return providers.filter((p) => Boolean(p.apiKey()));
}

/** Narrows arbitrary client input to a valid preference, defaulting to "auto". */
export function normalizeSttPreference(value: unknown): SttProviderPreference {
  if (typeof value === "string" && STT_PROVIDER_OPTIONS.some((o) => o.id === value)) {
    return value as SttProviderPreference;
  }
  return "auto";
}

/**
 * Resolves the ordered list of providers to attempt given the configured set
 * and an optional client preference. If a specific provider is requested and
 * available, it's tried first; the remaining configured providers stay as
 * fallbacks so a chosen-but-exhausted provider still degrades gracefully.
 */
export function resolveSttOrder(
  configured: SttProviderConfig[],
  preference: SttProviderPreference = "auto",
): SttProviderConfig[] {
  if (preference === "auto") return [...configured];
  const chosen = configured.find((p) => p.id === preference);
  if (!chosen) return [...configured];
  return [chosen, ...configured.filter((p) => p.id !== preference)];
}

export interface SttResult {
  text: string;
  provider: SttProviderId;
}

/**
 * Runs transcription across the resolved provider chain. Throws if no provider
 * is configured, or a combined error (preserving provider/quota wording) if all
 * configured providers fail.
 */
export async function transcribeWithFallback(opts: {
  audio: Blob;
  filename: string;
  preference?: SttProviderPreference;
  providers?: SttProviderConfig[];
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}): Promise<SttResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const configured = getConfiguredSttProviders(opts.providers ?? STT_PROVIDERS);
  if (configured.length === 0) {
    throw new Error(
      "No speech-to-text provider configured (set GROQ_API_KEY or OPENAI_API_KEY)",
    );
  }
  if (!opts.audio || opts.audio.size === 0) {
    throw new Error("Empty audio");
  }

  const order = resolveSttOrder(configured, opts.preference ?? "auto");
  const errors: string[] = [];

  for (const provider of order) {
    const form = new FormData();
    form.append("file", opts.audio, opts.filename);
    form.append("model", provider.model);
    form.append("response_format", "json");

    try {
      const resp = await fetchImpl(provider.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${provider.apiKey()}` },
        body: form,
      });
      if (!resp.ok) {
        const body = (await resp.text()).slice(0, 200);
        errors.push(`${provider.id} ${resp.status}: ${body}`);
        continue; // fall through to next provider (quota/429/outage/etc.)
      }
      const payload = (await resp.json()) as { text?: string };
      return { text: payload.text ?? "", provider: provider.id };
    } catch (err) {
      errors.push(`${provider.id}: ${err instanceof Error ? err.message : "request failed"}`);
    }
  }

  // Preserve provider + quota wording so UI billing detection still fires.
  throw new Error(`Transcription failed on all providers. ${errors.join(" | ")}`);
}
