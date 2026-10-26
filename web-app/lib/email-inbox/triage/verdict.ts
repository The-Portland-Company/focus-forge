import type { EmailRule, InboxItem } from "@/lib/types";

/**
 * The deterministic output of Stage 0 (the rules engine). This is the thing that
 * is persisted on the thread and shown to the user — it carries NO AI input.
 *
 * A verdict is TERMINAL when a rule decided the thread's fate with no help from
 * the AI (spam / always_delete / archive / quarantine / skip_ai, or an explicit
 * stopProcessing). A terminal thread never enters the AI enhancement queue.
 */
export type RuleVerdict = {
  /** All rules that matched, in evaluation order. */
  matchedRuleIds: string[];
  /** The first terminal rule, or the highest-precedence match when none is terminal. */
  winningRuleId: string | null;
  /** Union of every matched rule's action types, deduped. */
  actions: string[];
  /** Rule-forced status, or null when no rule touched status. */
  status: InboxItem["status"] | null;
  /** Rule-forced classification, or null when no rule touched classification. */
  classification: InboxItem["classification"] | null;
  /** Rule-forced inbox tab id, or null. */
  inboxTabId: string | null;
  /** True when require_project forced the thread to needs_project. */
  needsProject: boolean;
  /** True when always_delete fired. */
  alwaysDelete: boolean;
  /** never_spam matched — the content spam classifier must be suppressed. */
  preventSpamClassification: boolean;
  /** skip_ai matched — the user asserts they know what this is; no model call. */
  skipAi: boolean;
  /** No further rules or AI should run for this thread. */
  terminal: boolean;
};

export const EMPTY_VERDICT: RuleVerdict = {
  matchedRuleIds: [],
  winningRuleId: null,
  actions: [],
  status: null,
  classification: null,
  inboxTabId: null,
  needsProject: false,
  alwaysDelete: false,
  preventSpamClassification: false,
  skipAi: false,
  terminal: false,
};

export type TriageState = "rule" | "pending_ai" | "ai" | "manual";

/**
 * The per-thread deterministic record persisted at `email_threads.triage_json`.
 * Small and overwritten on every reprocess — it replaces the append-only
 * ai_decision_traces email rows.
 */
export type TriageRecord = {
  v: 1;
  evaluatedAt: string;
  messageId: string;
  decidedBy: "rule" | "ai" | "heuristic" | "knn";
  winningRuleId: string | null;
  matchedRuleIds: string[];
  actions: string[];
  terminal: boolean;
  aiCalled: boolean;
  ai?: {
    model: string | null;
    classification: string | null;
    confidence: number | null;
    reason: string | null;
  } | null;
};

export type ScopedRule = EmailRule;
