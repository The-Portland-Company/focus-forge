/**
 * Per-ORGANIZATION email/spam AI configuration.
 *
 * Inbound mail is triaged on behalf of an organization, not a single user, so
 * the email waterfall is stored on organizations.ai_settings (JSONB):
 *
 *   { "email": { "enabled": boolean, "chain": string[] } }
 *
 * Absent/invalid settings fall back to DEFAULT_EMAIL_CHAIN_IDS. An explicit
 * `enabled: false` returns an EMPTY chain, which the caller reads as
 * "heuristic only" — the org's mail never reaches an external LLM.
 */

import {
  DEFAULT_EMAIL_CHAIN_IDS,
  chainIdsToSpecs,
  normalizeChainIds,
} from "./model-chains";
import type { ModelSpec } from "./structured-waterfall";

/** The normalized `email` slice of organizations.ai_settings. */
export interface OrgEmailAISettings {
  enabled: boolean;
  chain: string[];
}

/** The normalized organizations.ai_settings document. */
export interface OrgAISettings {
  email: OrgEmailAISettings;
}

export function defaultOrgEmailAISettings(): OrgEmailAISettings {
  return { enabled: true, chain: [...DEFAULT_EMAIL_CHAIN_IDS] };
}

export function defaultOrgAISettings(): OrgAISettings {
  return { email: defaultOrgEmailAISettings() };
}

/**
 * Coerce a raw organizations.ai_settings JSONB value into the normalized shape.
 * Unknown model ids are dropped, missing ones appended in default order, and
 * `enabled` defaults to true (LLM triage is on unless an org opts out).
 */
export function normalizeOrgAISettings(raw: unknown): OrgAISettings {
  const doc =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const email =
    doc.email && typeof doc.email === "object" && !Array.isArray(doc.email)
      ? (doc.email as Record<string, unknown>)
      : {};
  return {
    email: {
      enabled: email.enabled === undefined ? true : email.enabled !== false,
      chain: normalizeChainIds(email.chain, "email"),
    },
  };
}

/**
 * Resolve the ordered provider chain for an org's email triage.
 * Returns [] when the org has disabled LLM triage → heuristic only.
 */
export function resolveEmailChain(raw: unknown): ModelSpec[] {
  const settings = normalizeOrgAISettings(raw);
  if (!settings.email.enabled) return [];
  return chainIdsToSpecs(settings.email.chain);
}
