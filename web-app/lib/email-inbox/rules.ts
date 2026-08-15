import {
  matchesPattern,
  templateHasPattern,
} from "@/lib/email-inbox/rule-pattern";
import type { EmailRule, EmailRuleCondition } from "@/lib/types";

export type EmailRuleContext = {
  senderEmail: string;
  senderDomain: string;
  subject: string;
  body: string;
  mailbox: string;
  participants: string[];
};

export type AppliedEmailRules = {
  matchedRules: EmailRule[];
  actions: string[];
  stopProcessing: boolean;
};

export function compareValue(
  actual: string,
  operator: EmailRuleCondition["operator"],
  expected: string,
) {
  if (operator === "matches") {
    return matchesPattern(actual, expected);
  }

  // A value carrying `{...}` or `*` is unambiguously a pattern, so it matches
  // as one without the user also having to change the operator. `equals` stays
  // anchored — it still means "the whole field", just with placeholders in it.
  if (
    (operator === "contains" || operator === "equals") &&
    templateHasPattern(expected)
  ) {
    return matchesPattern(actual, expected, {
      anchored: operator === "equals",
    });
  }

  const normalizedActual = actual.toLowerCase();
  const normalizedExpected = expected.toLowerCase();

  switch (operator) {
    case "equals":
      return normalizedActual === normalizedExpected;
    case "starts_with":
      return normalizedActual.startsWith(normalizedExpected);
    case "ends_with":
      return normalizedActual.endsWith(normalizedExpected);
    case "contains":
    default:
      return normalizedActual.includes(normalizedExpected);
  }
}

export function ruleMatches(rule: EmailRule, context: EmailRuleContext) {
  if (!rule.isActive) return false;
  if (!Array.isArray(rule.conditions) || rule.conditions.length === 0)
    return false;

  const results = rule.conditions.map((condition) => {
    const value = condition.value || "";

    switch (condition.field) {
      case "sender_email":
        return compareValue(context.senderEmail, condition.operator, value);
      case "sender_domain":
        return compareValue(context.senderDomain, condition.operator, value);
      case "subject":
        return compareValue(context.subject, condition.operator, value);
      case "body":
        return compareValue(context.body, condition.operator, value);
      case "mailbox":
        return compareValue(context.mailbox, condition.operator, value);
      case "participant":
        return context.participants.some((participant) =>
          compareValue(participant, condition.operator, value),
        );
      default:
        return false;
    }
  });

  return rule.matchMode === "any"
    ? results.some(Boolean)
    : results.every(Boolean);
}

export function applyEmailRules(
  rules: EmailRule[],
  context: EmailRuleContext,
): AppliedEmailRules {
  const ordered = [...rules].sort((a, b) => a.priority - b.priority);
  const matchedRules: EmailRule[] = [];
  const actions = new Set<string>();
  let stopProcessing = false;

  for (const rule of ordered) {
    if (!ruleMatches(rule, context)) continue;
    matchedRules.push(rule);
    rule.actions.forEach((action) => actions.add(action.type));
    if (rule.stopProcessing) {
      stopProcessing = true;
      break;
    }
  }

  return {
    matchedRules,
    actions: Array.from(actions),
    stopProcessing,
  };
}
