import { ruleMatches, type EmailRuleContext } from "@/lib/email-inbox/rules";
import { orderRulesForEvaluation } from "@/lib/email-inbox/triage/order";
import { EMPTY_VERDICT, type RuleVerdict } from "@/lib/email-inbox/triage/verdict";
import type { EmailRule, InboxItem } from "@/lib/types";

export type { EmailRuleContext } from "@/lib/email-inbox/rules";

/**
 * Pure Stage 0 engine. Given the rules that apply to a thread's mailbox and the
 * message context, produce the deterministic RuleVerdict.
 *
 * Order (see triage/order.ts): protective `never_spam` rules first, then
 * priority ascending, then specificity, scope, createdAt. The first TERMINAL
 * match wins and stops the scan; non-terminal actions accumulate.
 *
 * `never_spam` establishes trust: it suppresses any later spam/quarantine
 * rule's spam effect (mirrors the legacy preventSpamClassification path) and
 * those suppressed rules then do NOT terminate evaluation.
 */
export function evaluateEmailRules(
  rules: EmailRule[],
  context: EmailRuleContext,
): RuleVerdict {
  const ordered = orderRulesForEvaluation(rules.filter((r) => r.isActive));

  const matchedRuleIds: string[] = [];
  const actionSet = new Set<string>();
  let status: InboxItem["status"] | null = null;
  let classification: InboxItem["classification"] | null = null;
  let inboxTabId: string | null = null;
  let needsProject = false;
  let alwaysDelete = false;
  let preventSpamClassification = false;
  let skipAi = false;
  let terminal = false;
  let winningRuleId: string | null = null;

  // First pass is implicit: because protective rules sort first,
  // preventSpamClassification is already set before any spam rule is reached.
  for (const rule of ordered) {
    if (!ruleMatches(rule, context)) continue;
    matchedRuleIds.push(rule.id);

    let ruleTerminated = false;

    for (const action of rule.actions) {
      actionSet.add(action.type);
      switch (action.type) {
        case "never_spam":
          preventSpamClassification = true;
          break;
        case "always_delete":
          status = "deleted";
          classification = "spam";
          alwaysDelete = true;
          ruleTerminated = true;
          break;
        case "spam":
          if (!preventSpamClassification) {
            status = "quarantine";
            classification = "spam";
            ruleTerminated = true;
          }
          break;
        case "quarantine":
          if (!preventSpamClassification) {
            status = "quarantine";
            ruleTerminated = true;
          }
          break;
        case "archive":
          status = "archived";
          ruleTerminated = true;
          break;
        case "require_project":
          needsProject = true;
          status = status ?? "needs_project";
          break;
        case "set_classification": {
          const value = normalizeClassification(action.value);
          if (value) classification = value;
          break;
        }
        case "set_inbox_tab": {
          const value =
            typeof action.value === "string" && action.value.trim()
              ? action.value.trim()
              : null;
          if (value) inboxTabId = value;
          break;
        }
        case "skip_ai":
          skipAi = true;
          ruleTerminated = true;
          break;
        default:
          // mark_read, assign_mailbox_owner, generate_tasks: non-terminal,
          // consumed by the persistence layer.
          break;
      }
    }

    if (ruleTerminated && !winningRuleId) {
      winningRuleId = rule.id;
    }

    if (ruleTerminated || rule.stopProcessing) {
      terminal = true;
      if (!winningRuleId) winningRuleId = rule.id;
      break;
    }
  }

  if (matchedRuleIds.length === 0) {
    return { ...EMPTY_VERDICT };
  }

  if (!winningRuleId) winningRuleId = matchedRuleIds[0];

  return {
    matchedRuleIds,
    winningRuleId,
    actions: Array.from(actionSet),
    status,
    classification,
    inboxTabId,
    needsProject,
    alwaysDelete,
    preventSpamClassification,
    skipAi,
    terminal,
  };
}

const CLASSIFICATION_VALUES = new Set<InboxItem["classification"]>([
  "unknown",
  "actionable",
  "newsletter",
  "spam",
  "waiting",
  "reference",
  "transactional",
]);

function normalizeClassification(
  value: unknown,
): InboxItem["classification"] | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase() as InboxItem["classification"];
  return CLASSIFICATION_VALUES.has(normalized) ? normalized : null;
}
