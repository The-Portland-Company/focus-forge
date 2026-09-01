import type { EmailThreadAIOutput } from "@/lib/email-inbox/ai";
import type { InboxItem } from "@/lib/types";

/**
 * Sender domains that must NEVER be spam as a result of the email's own content
 * (the k-NN model or the LLM/heuristic spam axis). Explicit user rules keyed on
 * subject/body/etc. may still route these to spam — this exemption only disables
 * the automatic content classifier, not rule-driven actions.
 */
export const NEVER_SPAM_SENDER_DOMAINS = ["theportlandcompany.com"];

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
 * Keeps legitimate inbound mail in the ACTIVE inbox.
 *
 * OLD behavior: a freshly-synced inbound thread could be pulled straight out of
 * the active view by the AI/heuristic's own guess — demoted to `needs_project`
 * (merely "actionable but I couldn't route it"), to `archived`, or worst of all
 * to `quarantine` for anything the model judged "low-value". Quarantine/archive
 * HIDE a thread from the inbox entirely, so ordinary mail that is still sitting
 * in the provider inbox (promotional, newsletters, low-priority, "unsure")
 * vanished from FF's inbox and it looked far emptier than Gmail's.
 *
 * NEW behavior: a thread only leaves `active` when it is genuinely spam/junk or
 * an explicit user rule says so. Everything else stays `active` and simply
 * carries its classification label (it can be filtered/labeled, not hidden).
 *
 * This does NOT weaken spam handling — the spam path is deliberately preserved:
 *   • real spam keeps classification "spam" (from the LLM, the k-NN override, or
 *     a `spam` rule) and its quarantine/spam/deleted status is left untouched;
 *   • explicit user rules (`always_delete`, `spam`, `quarantine`, `archive`,
 *     `require_project`) are always honored;
 *   • provider-side archive mirroring (mirrorProviderFolderState) is a separate
 *     mechanism and is unaffected by this guard.
 *
 * Only the AI's own non-spam demotion of normal mail is reverted to `active`.
 */
export function keepLegitMailActive<
  C extends InboxItem["classification"],
  S extends InboxItem["status"],
>(params: {
  classification: C;
  status: S;
  needsProject: boolean;
  ruleActions: Set<string>;
}): { classification: C; status: S | "active"; needsProject: boolean } {
  const { classification, status, ruleActions } = params;

  // A spam/junk disposition (however it was reached) is never touched.
  const isSpamDisposition =
    classification === "spam" || status === "spam" || status === "deleted";

  // Any explicit user rule that intentionally files mail out of the inbox wins.
  const ruleForced =
    ruleActions.has("always_delete") ||
    ruleActions.has("spam") ||
    ruleActions.has("quarantine") ||
    ruleActions.has("archive") ||
    ruleActions.has("require_project");

  if (
    !isSpamDisposition &&
    !ruleForced &&
    (status === "archived" ||
      status === "needs_project" ||
      status === "quarantine")
  ) {
    return { classification, status: "active", needsProject: false };
  }

  return { classification, status, needsProject: params.needsProject };
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
