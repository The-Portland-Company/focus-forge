import type { EmailThreadAIOutput } from "@/lib/email-inbox/ai";
import type { InboxItem } from "@/lib/types";

/**
 * Sender domains that must NEVER be spam as a result of the email's own content
 * (the k-NN model or the LLM/heuristic spam axis). Explicit user rules keyed on
 * subject/body/etc. may still route these to spam — this exemption only disables
 * the automatic content classifier, not rule-driven actions.
 */
export const NEVER_SPAM_SENDER_DOMAINS = ["theportlandcompany.com"];

/**
 * Senders that NEVER create tasks: the org's own domains/tools and test or
 * blast senders. Parallel to NEVER_SPAM_SENDER_DOMAINS (which only exempts
 * spam classification).
 */
export const NEVER_TASK_SENDER_DOMAINS = [
  "theportlandcompany.com",
  "focusforge.dev",
  "focusforge.app",
  "usesend.com",
];

/** Address-level patterns (tools, warmup/test senders, nuera blasts). */
export const NEVER_TASK_SENDER_ADDRESS_PATTERNS: RegExp[] = [
  /bartok/i,
  /swarm[-_. ]?tester/i,
  /usesend/i,
  /warm[-_. ]?up/i,
  /^(test|testing)[-_.+0-9]*@/i,
  /^(blast|blasts|campaign|marketing|newsletter|promo)[-_.+0-9a-z]*@nueraheat\.net$/i,
];

/** True when mail from `senderEmail` must never generate tasks. */
export function isNeverTaskSender(
  senderEmail: string | null | undefined,
): boolean {
  const email = (senderEmail || "").trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1);
  if (
    NEVER_TASK_SENDER_DOMAINS.some(
      (d) => domain === d || domain.endsWith(`.${d}`),
    )
  ) {
    return true;
  }
  return NEVER_TASK_SENDER_ADDRESS_PATTERNS.some((re) => re.test(email));
}

/**
 * Gate for auto-creating "Review and respond" tasks: the newest message must
 * be inbound (never triage the user's own reply) and not from a self/system
 * sender.
 */
export function canAutoCreateTasksForMessage(
  message: { direction?: string | null } | null | undefined,
  senderEmail: string | null | undefined,
): boolean {
  if (!message || message.direction !== "inbound") return false;
  return !isNeverTaskSender(senderEmail);
}

/** True when `senderEmail`'s domain is on the content-spam exemption list. */
export function isContentSpamExemptSender(
  senderEmail: string | null | undefined,
): boolean {
  const at = (senderEmail || "").trim().toLowerCase().lastIndexOf("@");
  if (at < 0) return false;
  const domain = (senderEmail as string).trim().toLowerCase().slice(at + 1);
  return NEVER_SPAM_SENDER_DOMAINS.some(
    (exempt) => domain === exempt || domain.endsWith(`.${exempt}`),
  );
}

/**
 * Applies the trainable k-NN spam verdict on top of the rule/LLM-resolved thread
 * state.
 *
 * The k-NN may only ever UPGRADE a thread to spam. It must NEVER downgrade a
 * confident LLM spam verdict back to actionable: senders the user explicitly
 * trained as "not spam" are already protected upstream by the `never_spam` RULE
 * (via `suppressContentSpam`/`preventSpamClassification`, which skips this
 * override entirely and tells the LLM not to mark spam). The old similarity-based
 * not_spam downgrade was redundant with that protection and, on a corpus skewed
 * toward not_spam examples, confidently un-flagged real spam. DeepSeek V4 is the
 * reliable primary classifier — the noisy k-NN corpus does not get to overrule
 * its spam calls.
 */
export function applySpamKnnOverride<
  C extends InboxItem["classification"],
  S extends InboxItem["status"],
>(params: {
  classification: C;
  status: S;
  needsProject: boolean;
  /** Confident k-NN label, or null when absent/low-confidence. */
  knnLabel: "spam" | "not_spam" | null;
  knnConfident: boolean;
  /** never_spam rule or exempt sender domain — skips the override entirely. */
  suppressContentSpam: boolean;
}): {
  classification: C | "spam";
  status: S | "quarantine";
  needsProject: boolean;
} {
  const { classification, status, needsProject } = params;
  if (
    params.knnConfident &&
    !params.suppressContentSpam &&
    params.knnLabel === "spam"
  ) {
    return { classification: "spam", status: "quarantine", needsProject };
  }
  return { classification, status, needsProject };
}

/**
 * M2 boundary helper: a rule-decided field is immutable to the AI. Given the
 * AI's resolved classification/inbox tab and the deterministic verdict, the
 * verdict's non-null value always wins; otherwise the AI value stands.
 *
 * Kept pure (no DB) so the "AI never overwrites a rule-decided field" contract
 * is unit-testable.
 */
export function mergeRuleDecidedFields<C>(params: {
  aiClassification: C;
  aiInboxTabId: string | null;
  verdictClassification: C | null;
  verdictInboxTabId: string | null;
}): { classification: C; inboxTabId: string | null } {
  return {
    classification: params.verdictClassification ?? params.aiClassification,
    inboxTabId: params.verdictInboxTabId ?? params.aiInboxTabId,
  };
}

export function resolveRuleDrivenThreadState(params: {
  aiResult: EmailThreadAIOutput;
  ruleActions: Set<string>;
}) {
  const preventSpamClassification = params.ruleActions.has("never_spam");
  let status: InboxItem["status"] = params.aiResult.status;
  let classification: InboxItem["classification"] =
    params.aiResult.classification;
  let needsProject = params.aiResult.needsProject;
  let alwaysDelete = false;

  if (params.ruleActions.has("always_delete")) {
    status = "deleted";
    classification = "spam";
    alwaysDelete = true;
  } else if (!preventSpamClassification && params.ruleActions.has("spam")) {
    status = "quarantine";
    classification = "spam";
  } else if (
    !preventSpamClassification &&
    params.ruleActions.has("quarantine")
  ) {
    status = "quarantine";
  } else if (params.ruleActions.has("archive")) {
    status = "archived";
  }

  if (params.ruleActions.has("require_project")) {
    needsProject = true;
    status = "needs_project";
  }

  return {
    status,
    classification,
    needsProject,
    alwaysDelete,
    preventSpamClassification,
  };
}
