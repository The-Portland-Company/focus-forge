/**
 * Independent, per-surface AI model chains.
 *
 * The estimator and the assistant each have their OWN ordered, quality-first
 * waterfall (separate default + separate ordered chain). Changing one MUST NOT
 * change the other. Chains are persisted per-user as a JSONB column
 * (profiles.ai_model_chains = { estimator: string[], assistant: string[] }) of
 * model IDs; this module owns the known-model registry, the defaults, and the
 * pure resolver that maps a stored string[] back to ModelSpec[].
 */

import type { ModelSpec, WaterfallProvider } from "./structured-waterfall";

export type AISurface = "estimator" | "assistant";

/** The known models the UI lets users order. Each maps to a provider. */
export interface KnownModel {
  id: string;
  label: string;
  provider: WaterfallProvider;
}

export const KNOWN_MODELS: KnownModel[] = [
  { id: "claude-opus-4-8", label: "Claude Opus 4.8 (Anthropic)", provider: "anthropic" },
  { id: "gpt-4.1", label: "GPT-4.1 (OpenAI)", provider: "openai" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (Anthropic)", provider: "anthropic" },
  { id: "grok-3", label: "Grok 3 (xAI)", provider: "xai" },
];

const MODEL_BY_ID = new Map(KNOWN_MODELS.map((m) => [m.id, m]));

/**
 * DEFAULT WATERFALL ORDER (quality-first; position 1 = default). The estimator
 * and the assistant default to the SAME ordering, but they are stored and
 * resolved independently — editing one surface never touches the other.
 */
export const DEFAULT_CHAIN_IDS: string[] = [
  "claude-opus-4-8",
  "gpt-4.1",
  "claude-sonnet-4-6",
  "grok-3",
];

export function defaultChainIds(): string[] {
  return [...DEFAULT_CHAIN_IDS];
}

/** Stored shape on the profile (JSONB). */
export interface AIModelChains {
  estimator: string[];
  assistant: string[];
}

export function defaultModelChains(): AIModelChains {
  return { estimator: defaultChainIds(), assistant: defaultChainIds() };
}

/** Map a model id to its ModelSpec, or null when unknown. */
export function modelSpecFor(id: string): ModelSpec | null {
  const m = MODEL_BY_ID.get(id);
  return m ? { provider: m.provider, model: m.id } : null;
}

/**
 * Normalize a raw stored chain (string[]): drop unknown ids, de-dupe, and
 * append any known models the user omitted so the chain always covers all 4 in
 * a sensible order. Falls back to the default order when empty/invalid.
 */
export function normalizeChainIds(raw: unknown): string[] {
  const arr = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of arr) {
    if (MODEL_BY_ID.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  // Append any known model the user left out, in default order.
  for (const id of DEFAULT_CHAIN_IDS) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out.length > 0 ? out : defaultChainIds();
}

/**
 * Resolve the per-surface chain to ModelSpec[]. `chains` is the user's stored
 * value (or null/undefined when absent → falls back to the quality-first
 * default). The estimator reads its own slice; the assistant reads its own.
 */
export function resolveChain(
  surface: AISurface,
  chains?: Partial<AIModelChains> | null,
): ModelSpec[] {
  const raw = chains?.[surface];
  const ids = normalizeChainIds(raw);
  return ids
    .map(modelSpecFor)
    .filter((s): s is ModelSpec => s !== null);
}
