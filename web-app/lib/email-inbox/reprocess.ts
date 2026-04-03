import type { EmailThreadAIOutput } from "@/lib/email-inbox/ai";
import type { InboxItem } from "@/lib/types";

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
