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
