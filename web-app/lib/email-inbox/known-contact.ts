import type { EmailRuleCondition } from "@/lib/types";

/**
 * A "Known Contact" is a sender the user trusts: their mail is never run through
 * the spam classifier and always scores 0%. We express this as a deterministic,
 * user-scoped `never_spam` email rule (no AI/LLM, instant) so it is applied as a
 * hard override BEFORE any AI spam scoring — see `suppressContentSpam` in
 * reprocessThread. Storing it as an email_rule reuses the existing rule
 * evaluation, RLS, and management UI rather than introducing a new table.
 *
 * User-scoped (mailboxId = null) on purpose: "known" is about the person, so it
 * holds across every mailbox the user owns.
 */

export function normalizeKnownContactEmail(email: string): string {
  return String(email || "").trim().toLowerCase();
}

/** Deterministic sender_email exact-match condition used for known contacts. */
export function buildKnownContactConditions(
  senderEmail: string,
): EmailRuleCondition[] {
  return [
    {
      field: "sender_email",
      operator: "equals",
      value: normalizeKnownContactEmail(senderEmail),
    },
  ];
}

export type KnownContactRulePayload = {
  userId: string;
  mailboxId: null;
  name: string;
  description: string;
  // Must be one of the email_rules_source_check values ('user' | 'system' |
  // 'ai_training'). A Known Contact is a user-created allow rule, so 'user'.
  // (Using an out-of-set value silently fails the INSERT under RLS/admin.)
  source: "user";
  isActive: true;
  priority: number;
  matchMode: "all";
  conditions: EmailRuleCondition[];
  actions: { type: "never_spam" }[];
  stopProcessing: false;
};

/**
 * Build the email_rules payload for marking a sender as a known contact.
 * Pure and deterministic so it is unit-testable and produces identical rules
 * whether created by the button or auto-created from reply history.
 */
export function buildKnownContactRulePayload(params: {
  userId: string;
  senderEmail: string;
  senderName?: string | null;
}): KnownContactRulePayload {
  const senderEmail = normalizeKnownContactEmail(params.senderEmail);
  const label = params.senderName?.trim()
    ? `${params.senderName.trim()} (${senderEmail})`
    : senderEmail;

  return {
    userId: params.userId,
    mailboxId: null,
    name: `Known contact: ${senderEmail}`.slice(0, 120),
    description:
      `Mail from ${label} is from a known contact — never marked as spam.`.slice(
        0,
        220,
      ),
    source: "user",
    isActive: true,
    priority: 1,
    matchMode: "all",
    conditions: buildKnownContactConditions(senderEmail),
    actions: [{ type: "never_spam" }],
    stopProcessing: false,
  };
}
