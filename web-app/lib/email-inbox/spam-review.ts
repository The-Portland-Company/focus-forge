import { sortInboxItems } from "@/lib/email-inbox/shared";
import type { EmailRule, InboxItem } from "@/lib/types";

export type CreatedSpamReviewRule = {
  threadId: string;
  rule: EmailRule;
  rationale: string;
};

const RULE_FIELD_LABELS: Record<string, string> = {
  sender_email: "Sender email",
  sender_domain: "Sender domain",
  subject: "Subject",
  body: "Body",
  mailbox: "Mailbox",
  participant: "Participant",
};

const RULE_OPERATOR_LABELS: Record<string, string> = {
  contains: "contains",
  equals: "equals",
  ends_with: "ends with",
  starts_with: "starts with",
};

export function listDetectedSpamItems(
  items: InboxItem[],
  mailboxId?: string | null,
) {
  return sortInboxItems(
    items.filter((item) => {
      if (item.classification !== "spam") {
        return false;
      }

      if (mailboxId && mailboxId !== "all" && item.mailboxId !== mailboxId) {
        return false;
      }

      return true;
    }),
  );
}

export function buildSpamReviewSessionItems(
  items: InboxItem[],
  mailboxId?: string | null,
) {
  return listDetectedSpamItems(items, mailboxId).map((item) => ({
    item,
    keepSpam: true,
  }));
}

export function summarizeEmailRuleConditions(
  rule: Pick<EmailRule, "conditions" | "matchMode">,
) {
  if (!rule.conditions.length) {
    return "No conditions";
  }

  const joiner = rule.matchMode === "any" ? " OR " : " AND ";

  return rule.conditions
    .map((condition) => {
      const fieldLabel = RULE_FIELD_LABELS[condition.field] || condition.field;
      const operatorLabel =
        RULE_OPERATOR_LABELS[condition.operator] || condition.operator;
      return `${fieldLabel} ${operatorLabel} "${condition.value}"`;
    })
    .join(joiner);
}

export function upsertCreatedSpamReviewRule(
  existing: CreatedSpamReviewRule[],
  nextEntry: CreatedSpamReviewRule,
) {
  const remaining = existing.filter(
    (entry) => entry.threadId !== nextEntry.threadId,
  );
  return [nextEntry, ...remaining];
}

export function removeCreatedSpamReviewRule(
  existing: CreatedSpamReviewRule[],
  threadId: string,
) {
  return existing.filter((entry) => entry.threadId !== threadId);
}

export function shouldConfirmSpamRuleUndo(params: {
  createdRuleId?: string | null;
  nextKeepSpam: boolean;
}) {
  return Boolean(params.nextKeepSpam && params.createdRuleId);
}
