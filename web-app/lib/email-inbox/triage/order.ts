import type { EmailRule, EmailRuleCondition } from "@/lib/types";

/**
 * Deterministic evaluation order for the rules engine (documented in the plan's
 * Proposed Architecture). Lower sort value is evaluated first.
 *
 * 1. Protective actions first: a `never_spam` rule is evaluated before any
 *    spam-type rule regardless of priority (formalises today's
 *    preventSpamClassification short-circuit).
 * 2. Then `priority` ascending.
 * 3. Tie-break by specificity of the most-specific condition field:
 *    sender_email > sender_domain > participant > subject > body > mailbox.
 * 4. Then scope precedence: mailbox-scoped beats org-scoped beats user-scoped.
 * 5. Then createdAt (older first) for a stable, reproducible order.
 */

const FIELD_SPECIFICITY: Record<EmailRuleCondition["field"], number> = {
  sender_email: 0,
  sender_domain: 1,
  participant: 2,
  subject: 3,
  body: 4,
  mailbox: 5,
};

/** A rule is protective when it only establishes trust (never_spam). */
export function isProtectiveRule(rule: EmailRule): boolean {
  return rule.actions.some((action) => action.type === "never_spam");
}

/** Most-specific (lowest) field specificity among a rule's conditions. */
function ruleSpecificity(rule: EmailRule): number {
  let best = Number.POSITIVE_INFINITY;
  for (const condition of rule.conditions) {
    const value = FIELD_SPECIFICITY[condition.field];
    if (value !== undefined && value < best) best = value;
  }
  return Number.isFinite(best) ? best : 99;
}

/** Scope precedence: mailbox (0) > org (1) > user/global (2). */
function ruleScopeRank(rule: EmailRule): number {
  if (rule.mailboxId) return 0;
  if (rule.organizationId) return 1;
  return 2;
}

/** Stable comparator implementing the documented evaluation order. */
export function compareRulesForEvaluation(a: EmailRule, b: EmailRule): number {
  const aProtective = isProtectiveRule(a) ? 0 : 1;
  const bProtective = isProtectiveRule(b) ? 0 : 1;
  if (aProtective !== bProtective) return aProtective - bProtective;

  if (a.priority !== b.priority) return a.priority - b.priority;

  const aSpec = ruleSpecificity(a);
  const bSpec = ruleSpecificity(b);
  if (aSpec !== bSpec) return aSpec - bSpec;

  const aScope = ruleScopeRank(a);
  const bScope = ruleScopeRank(b);
  if (aScope !== bScope) return aScope - bScope;

  const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  if (aTime !== bTime) return aTime - bTime;

  return String(a.id).localeCompare(String(b.id));
}

export function orderRulesForEvaluation(rules: EmailRule[]): EmailRule[] {
  return [...rules].sort(compareRulesForEvaluation);
}

/**
 * Action types that terminate evaluation on their own: once one fires, the
 * thread's fate is sealed and the AI never runs. (`require_project` and
 * `generate_tasks` are NON-terminal — they still want AI enrichment.)
 */
export const TERMINAL_ACTION_TYPES = new Set<string>([
  "spam",
  "always_delete",
  "archive",
  "quarantine",
  "skip_ai",
]);
