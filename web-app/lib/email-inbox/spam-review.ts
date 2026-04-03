import { sortInboxItems } from "@/lib/email-inbox/shared";
import type { EmailRule, InboxItem } from "@/lib/types";

export type CreatedSpamReviewRule = {
  threadId: string;
  rule: EmailRule;
  rationale: string;
};

export type ExistingSpamReviewRuleGroup = {
  rule: EmailRule;
  threads: InboxItem[];
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

const RULE_ACTION_LABELS: Record<string, string> = {
  quarantine: "Quarantine",
  spam: "Mark as spam",
  always_delete: "Always delete",
  never_spam: "Never spam",
  mark_read: "Mark read",
  archive: "Archive",
  assign_mailbox_owner: "Assign mailbox owner",
  require_project: "Require project",
  generate_tasks: "Generate tasks",
};

const SPAM_REVIEW_RULE_ACTIONS = new Set([
  "quarantine",
  "spam",
  "always_delete",
]);

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

export function summarizeEmailRuleActions(rule: Pick<EmailRule, "actions">) {
  if (!rule.actions.length) {
    return "No actions";
  }

  return rule.actions
    .map((action) => RULE_ACTION_LABELS[action.type] || action.type)
    .join(", ");
}

export function buildExistingSpamReviewRuleGroups(params: {
  items: InboxItem[];
  rules: EmailRule[];
  keepSpamByThreadId?: Record<string, boolean>;
}) {
  const groupedRules = new Map<string, ExistingSpamReviewRuleGroup>();
  const unmatchedItems: InboxItem[] = [];
  const spamRulesById = new Map(
    params.rules
      .filter(
        (rule) =>
          rule.isActive &&
          rule.actions.some((action) =>
            SPAM_REVIEW_RULE_ACTIONS.has(action.type),
          ),
      )
      .map((rule) => [rule.id, rule] as const),
  );

  const activeSpamItems = listDetectedSpamItems(params.items).filter(
    (item) => params.keepSpamByThreadId?.[item.id] ?? true,
  );

  for (const item of activeSpamItems) {
    const matchedRules = Array.from(new Set(item.matchedRuleIds || []))
      .map((ruleId) => spamRulesById.get(ruleId))
      .filter(Boolean) as EmailRule[];

    if (matchedRules.length === 0) {
      unmatchedItems.push(item);
      continue;
    }

    matchedRules
      .sort(
        (left, right) =>
          left.priority - right.priority || left.name.localeCompare(right.name),
      )
      .forEach((rule) => {
        const current = groupedRules.get(rule.id);
        if (current) {
          current.threads.push(item);
          return;
        }

        groupedRules.set(rule.id, {
          rule,
          threads: [item],
        });
      });
  }

  const ruleGroups = Array.from(groupedRules.values())
    .map((entry) => ({
      ...entry,
      threads: sortInboxItems(entry.threads),
    }))
    .sort(
      (left, right) =>
        right.threads.length - left.threads.length ||
        left.rule.priority - right.rule.priority ||
        left.rule.name.localeCompare(right.rule.name),
    );

  return {
    ruleGroups,
    unmatchedItems: sortInboxItems(unmatchedItems),
  };
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
