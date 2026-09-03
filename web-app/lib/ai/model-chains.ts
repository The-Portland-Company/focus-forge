/**
 * Independent, per-surface AI model chains.
 *
 * The estimator, the assistant, and the email/spam classifier each have their
 * OWN ordered, quality-first waterfall (separate default + separate ordered
 * chain). Changing one MUST NOT change the others.
 *
 * Storage differs by surface:
 *   - estimator / assistant: per-USER, profiles.ai_model_chains (JSONB)
 *   - email: per-ORGANIZATION, organizations.ai_settings.email (JSONB), since
 *     inbound mail is triaged on behalf of an org, not a single user.
 *
 * This module owns the known-model registry, the defaults, and the pure
 * resolvers that map a stored string[] back to ModelSpec[].
 */

import type { ModelSpec, WaterfallProvider } from "./structured-waterfall";

export type AISurface = "estimator" | "assistant" | "email";

/** The known models the UI lets users order. Each maps to a provider. */
export interface KnownModel {
  id: string;
  label: string;
  provider: WaterfallProvider;
}

export const KNOWN_MODELS: KnownModel[] = [
  { id: "claude-opus-4-8", label: "Claude Opus 4.8 (Anthropic)", provider: "anthropic" },
  { id: "gpt-4.1", label: "GPT-4.1 (OpenAI)", provider: "openai" },
  // DeepSeek V4 is the current generation and the only one GET
  // https://api.deepseek.com/models still lists. Both V4 models are HYBRID
  // REASONERS: the reply carries `message.reasoning_content` (thinking) AND
  // `message.content` (the JSON answer), so the runner must give them enough
  // max_tokens for both or `content` comes back empty.
  {
    id: "deepseek-v4-flash",
    label: "DeepSeek V4 Flash (DeepSeek)",
    provider: "deepseek",
  },
  {
    id: "deepseek-v4-pro",
    label: "DeepSeek V4 Pro (DeepSeek)",
    provider: "deepseek",
  },
  // `deepseek-chat` is the LEGACY V3 alias. Still a valid, non-reasoning model,
  // kept registered so chains stored before the V4 upgrade keep resolving.
  {
    id: "deepseek-chat",
    label: "DeepSeek V3 Chat — legacy (DeepSeek)",
    provider: "deepseek",
  },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (Anthropic)", provider: "anthropic" },
  { id: "grok-3", label: "Grok 3 (xAI)", provider: "xai" },
  // Our fine-tuned estimator: a LoRA on Gemma-2B-it served by Cloudflare
  // Workers AI. Selectable in the estimator chain but NOT in DEFAULT_CHAIN_IDS,
  // so it is opt-in (never auto-appended to a user's chain).
  {
    id: "ff-estimator-gemma2b",
    label: "Focus Forge Estimator (fine-tuned, Gemma-2B)",
    provider: "cf-workers-ai",
  },
  // Free, self-hosted open model on Cloudflare Workers AI. Serves as the
  // terminal fallback in every default chain so triage and spam analysis keep
  // working when the paid providers are out of credits — no external paid API,
  // and it uses the same Cloudflare account that already runs spam embeddings.
  {
    id: "cf-llama-3.3-70b",
    label: "Llama 3.3 70B (Cloudflare, open)",
    provider: "cf-workers-ai",
  },
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
  // Terminal free fallback: when every paid provider above is out of credits,
  // the open Cloudflare model still answers. Last so it never displaces a paid
  // model while credits remain.
  "cf-llama-3.3-70b",
];

/**
 * DEFAULT EMAIL/SPAM WATERFALL. Deliberately DeepSeek-first: it is the cheapest
 * per-token of the three by a wide margin, and inbound mail is classified on
 * every message, so the email surface is the highest-volume AI call we make.
 * Claude and Grok sit behind it as quality/availability fallbacks.
 *
 * Leads with `deepseek-v4-flash` — the current DeepSeek generation, and the
 * economical half of it, which is the right trade for high-volume triage.
 *
 * Kept separate from DEFAULT_CHAIN_IDS so the email chain never picks up
 * estimator-only models (e.g. the fine-tuned Gemma LoRA).
 */
export const DEFAULT_EMAIL_CHAIN_IDS: string[] = [
  "deepseek-v4-flash",
  "claude-opus-4-8",
  "grok-3",
  // Terminal free fallback (Cloudflare open model) so inbound triage and spam
  // analysis survive a full paid-credit outage without leaving the app.
  "cf-llama-3.3-70b",
];

/**
 * The models a user may CHOOSE for the email chain. Broader than the default
 * chain so the DeepSeek variant (V4 Flash vs V4 Pro vs the legacy V3 alias) is
 * an actual choice in the UI, while the default ORDER above stays the one we
 * ship. Still excludes estimator-only models (the fine-tuned Gemma LoRA).
 */
export const EMAIL_SELECTABLE_IDS: string[] = [
  "deepseek-v4-flash",
  "deepseek-v4-pro",
  "deepseek-chat",
  "claude-opus-4-8",
  "claude-sonnet-4-6",
  "grok-3",
  "cf-llama-3.3-70b",
];

/** The models selectable for a given surface (email has its own allow-list). */
export function modelsForSurface(surface: AISurface): KnownModel[] {
  if (surface === "email") {
    return EMAIL_SELECTABLE_IDS.map((id) => MODEL_BY_ID.get(id)).filter(
      (m): m is KnownModel => Boolean(m),
    );
  }
  return KNOWN_MODELS;
}

/** The default chain for a surface, as model ids. */
export function defaultChainIdsFor(surface: AISurface): string[] {
  return surface === "email"
    ? [...DEFAULT_EMAIL_CHAIN_IDS]
    : [...DEFAULT_CHAIN_IDS];
}

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

/** Human-friendly label for a known model id (falls back to the id itself). */
export function modelLabel(id: string): string {
  return MODEL_BY_ID.get(id)?.label ?? id;
}

/**
 * Normalize a raw stored chain (string[]): drop ids that are unknown (or not
 * allowed for this surface), de-dupe, and append any missing models from the
 * surface's default so the chain always covers every position in a sensible
 * order. Falls back to the default order when empty/invalid.
 *
 * The email surface is restricted to EMAIL_SELECTABLE_IDS: an estimator-only
 * model (e.g. the fine-tuned Gemma LoRA) must never be force-appended into the
 * email chain.
 */
export function normalizeChainIds(
  raw: unknown,
  surface: AISurface = "estimator",
): string[] {
  const allowed = new Set(modelsForSurface(surface).map((m) => m.id));
  const defaults = defaultChainIdsFor(surface);
  const arr = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of arr) {
    if (allowed.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  // Append any default model the user left out, in default order.
  for (const id of defaults) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out.length > 0 ? out : defaults;
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
  const raw = chains?.[surface as keyof AIModelChains];
  return chainIdsToSpecs(normalizeChainIds(raw, surface));
}

/** Map an ordered list of model ids to their ModelSpecs, dropping unknowns. */
export function chainIdsToSpecs(ids: string[]): ModelSpec[] {
  return ids.map(modelSpecFor).filter((s): s is ModelSpec => s !== null);
}
