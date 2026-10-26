import { createHash } from "crypto";
import type { EmailRule, EmailRuleAction, EmailRuleCondition } from "@/lib/types";

export type FingerprintInput = {
  mailboxId?: string | null;
  organizationId?: string | null;
  userId?: string | null;
  matchMode?: EmailRule["matchMode"];
  conditions: EmailRuleCondition[];
  actions: EmailRuleAction[];
};

/** Canonical, order-independent serialisation of a rule's conditions. */
export function normalizeConditions(
  conditions: EmailRuleCondition[],
): Array<{ field: string; operator: string; value: string }> {
  return [...(conditions || [])]
    .map((condition) => ({
      field: String(condition.field),
      operator: String(condition.operator),
      value: String(condition.value ?? "").trim().toLowerCase(),
    }))
    .sort((a, b) =>
      `${a.field}:${a.operator}:${a.value}`.localeCompare(
        `${b.field}:${b.operator}:${b.value}`,
      ),
    );
}

/** Canonical, order-independent list of action types + their values. */
export function normalizeActions(
  actions: EmailRuleAction[],
): Array<{ type: string; value: string | null }> {
  return [...(actions || [])]
    .map((action) => ({
      type: String(action.type),
      value:
        action.value === undefined || action.value === null
          ? null
          : String(action.value).trim().toLowerCase(),
    }))
    .sort((a, b) =>
      `${a.type}:${a.value ?? ""}`.localeCompare(`${b.type}:${b.value ?? ""}`),
    );
}

/** Scope key: a rule is scoped to a mailbox, an org, or the user globally. */
function scopeKey(input: FingerprintInput): string {
  if (input.mailboxId) return `mailbox:${input.mailboxId}`;
  if (input.organizationId) return `org:${input.organizationId}`;
  return "user";
}

/**
 * sha256 over scope + matchMode + sorted normalised conditions + sorted
 * actions. Two rules with the same fingerprint are exact duplicates.
 */
export function computeRuleFingerprint(input: FingerprintInput): string {
  const payload = JSON.stringify({
    scope: scopeKey(input),
    matchMode: input.matchMode === "any" ? "any" : "all",
    conditions: normalizeConditions(input.conditions),
    actions: normalizeActions(input.actions),
  });
  return createHash("sha256").update(payload).digest("hex");
}
