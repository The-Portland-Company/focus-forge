import {
  computeRuleFingerprint,
  normalizeActions,
  normalizeConditions,
} from "@/lib/email-inbox/triage/fingerprint";
import type { EmailRule, EmailRuleAction, EmailRuleCondition } from "@/lib/types";

/** Soft-warn ceiling and hard cap on ACTIVE rules per user (plan M4 / decision #3). */
export const RULE_SOFT_WARN_COUNT = 120;
export const RULE_HARD_CAP = 150;
/** A value-family rule stops absorbing new values past this many. */
export const GROUP_MERGE_MAX_VALUES = 10;

export type RuleCandidate = {
  name: string;
  description?: string | null;
  mailboxId?: string | null;
  organizationId?: string | null;
  userId?: string | null;
  matchMode?: EmailRule["matchMode"];
  priority?: number;
  conditions: EmailRuleCondition[];
  actions: EmailRuleAction[];
  stopProcessing?: boolean;
  groupKey?: string | null;
  generatedBy?: "user" | "ai" | "system";
};

export type ProposalOutcome =
  | "create"
  | "merge_into"
  | "duplicate_of"
  | "covered_by";

export type RuleProposalDecision = {
  outcome: ProposalOutcome;
  fingerprint: string;
  /** Existing rule for merge_into / duplicate_of / covered_by. */
  targetRuleId: string | null;
  /** The value appended on merge_into. */
  mergeValue: string | null;
  mergeField: EmailRuleCondition["field"] | null;
  reason: string;
  /** Active-rule count is at/over the soft-warn threshold. */
  capWarning: boolean;
  /** Active-rule count is at/over the hard cap — the create must be refused. */
  capExceeded: boolean;
};

function sameScope(a: RuleCandidate, b: EmailRule): boolean {
  return (
    (a.mailboxId || null) === (b.mailboxId || null) &&
    (a.organizationId || null) === (b.organizationId || null)
  );
}

function sameActionSet(a: RuleCandidate, b: EmailRule): boolean {
  return (
    JSON.stringify(normalizeActions(a.actions)) ===
    JSON.stringify(normalizeActions(b.actions))
  );
}

function domainOf(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1) : "";
}

/**
 * Is every one of the candidate's conditions implied by SOME condition on the
 * existing rule? Implication is either an identical (field, operator, value) or
 * the sender_email→sender_domain broadening: an existing
 * `sender_domain equals x.com` implies a candidate `sender_email equals a@x.com`.
 * Only meaningful when the existing rule's matchMode is "all" (every existing
 * condition must hold) — otherwise the existing rule is weaker than it looks.
 */
export function conditionsSubsumedBy(
  candidate: EmailRuleCondition[],
  existing: EmailRule,
): boolean {
  if (existing.matchMode !== "all") return false;
  if (!candidate.length || !existing.conditions.length) return false;

  const norm = (c: EmailRuleCondition) => ({
    field: c.field,
    operator: c.operator,
    value: String(c.value ?? "").trim().toLowerCase(),
  });
  const existingNorm = existing.conditions.map(norm);

  return candidate.every((raw) => {
    const c = norm(raw);
    return existingNorm.some((e) => {
      if (e.field === c.field && e.operator === c.operator && e.value === c.value)
        return true;
      // Broadening: existing sender_domain equals D covers candidate
      // sender_email {equals|ends_with} *@D.
      if (
        e.field === "sender_domain" &&
        e.operator === "equals" &&
        c.field === "sender_email" &&
        (c.operator === "equals" || c.operator === "ends_with") &&
        domainOf(c.value) === e.value
      ) {
        return true;
      }
      return false;
    });
  });
}

/** A candidate is a value-family member when it has exactly one condition. */
function singleCondition(
  candidate: RuleCandidate,
): EmailRuleCondition | null {
  return candidate.conditions.length === 1 ? candidate.conditions[0] : null;
}

/**
 * Pure proposal decision. No DB. Given a candidate and the user's ACTIVE rules
 * (already scoped to the candidate's visibility), classify the outcome.
 */
export function evaluateProposal(
  candidate: RuleCandidate,
  activeRules: EmailRule[],
): RuleProposalDecision {
  const fingerprint = computeRuleFingerprint({
    mailboxId: candidate.mailboxId,
    organizationId: candidate.organizationId,
    userId: candidate.userId,
    matchMode: candidate.matchMode,
    conditions: candidate.conditions,
    actions: candidate.actions,
  });

  const activeCount = activeRules.length;
  const capWarning = activeCount >= RULE_SOFT_WARN_COUNT;
  const capExceeded = activeCount >= RULE_HARD_CAP;

  const base = {
    fingerprint,
    targetRuleId: null as string | null,
    mergeValue: null as string | null,
    mergeField: null as EmailRuleCondition["field"] | null,
    capWarning,
    capExceeded,
  };

  // 1. Exact duplicate.
  const exact = activeRules.find((r) => r.fingerprint === fingerprint);
  if (exact) {
    return {
      ...base,
      outcome: "duplicate_of",
      targetRuleId: exact.id,
      reason: `Identical to existing rule "${exact.name}".`,
    };
  }

  // 2. Subsumption — an existing broader rule with the same actions covers it.
  const covering = activeRules.find(
    (r) => sameActionSet(candidate, r) && conditionsSubsumedBy(candidate.conditions, r),
  );
  if (covering) {
    return {
      ...base,
      outcome: "covered_by",
      targetRuleId: covering.id,
      reason: `Already covered by broader rule "${covering.name}".`,
    };
  }

  // 3. Group-merge — same actions, scope, group_key, a single-condition value
  //    family (same field+operator), with headroom under GROUP_MERGE_MAX_VALUES.
  const cond = singleCondition(candidate);
  if (cond && candidate.groupKey) {
    const family = activeRules.find((r) => {
      if (!sameScope(candidate, r)) return false;
      if ((r.groupKey || null) !== candidate.groupKey) return false;
      if (!sameActionSet(candidate, r)) return false;
      if (!r.conditions.length) return false;
      // Every condition on the family rule shares this field+operator.
      const sameShape = r.conditions.every(
        (c) => c.field === cond.field && c.operator === cond.operator,
      );
      if (!sameShape) return false;
      if (r.conditions.length >= GROUP_MERGE_MAX_VALUES) return false;
      // Not already present.
      const target = String(cond.value ?? "").trim().toLowerCase();
      return !r.conditions.some(
        (c) => String(c.value ?? "").trim().toLowerCase() === target,
      );
    });
    if (family) {
      return {
        ...base,
        outcome: "merge_into",
        targetRuleId: family.id,
        mergeValue: cond.value,
        mergeField: cond.field,
        reason: `Merged into "${family.name}" (now ${
          family.conditions.length + 1
        } ${cond.field} values).`,
      };
    }
  }

  return {
    ...base,
    outcome: "create",
    reason: capExceeded
      ? `Rule limit (${RULE_HARD_CAP}) reached — merge or remove a rule first.`
      : "Created a new rule.",
  };
}
