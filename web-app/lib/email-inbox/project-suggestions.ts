import type { InboxItem, Project } from "@/lib/types";

/**
 * Ranks projects against an email so the assign-to-project picker can lead with
 * likely matches instead of an alphabetical list.
 *
 * Signals, strongest first: the sender's domain appearing in the project (a
 * client project named for the company that mails you is the clearest signal),
 * then the project name appearing in the subject, then in the AI summary or
 * body preview, then in the sender's display name. Matching is token-based so
 * "Village X" still matches "villagex.app", and each signal carries the reason
 * shown beside the suggestion.
 */

export type ProjectSuggestion = {
  project: Project;
  score: number;
  reason: string;
};

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "inc",
  "llc",
  "co",
  "com",
  "net",
  "org",
  "app",
  "site",
  "web",
  "www",
  "project",
  "new",
]);

function normalize(value: string | null | undefined): string {
  return (value || "").toLowerCase();
}

/** Letters/digits only, so "Village X" and "villagex.app" share a token. */
function tokens(value: string | null | undefined): string[] {
  return normalize(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function collapse(value: string | null | undefined): string {
  return normalize(value).replace(/[^a-z0-9]/g, "");
}

function senderOf(item: InboxItem) {
  return (item.participants || []).find(
    (participant) => participant.participantRole === "from",
  );
}

export function scoreProjectForInboxItem(
  project: Project,
  item: InboxItem,
): ProjectSuggestion | null {
  const projectTokens = tokens(project.name);
  const projectCollapsed = collapse(project.name);
  // A name made only of stop words ("The App") has nothing distinctive to match
  // on; without this it would collapse to "theapp" and hit every email that
  // happens to say "the app".
  if (projectTokens.length === 0) return null;

  const sender = senderOf(item);
  const senderEmail = normalize(sender?.emailAddress);
  const senderDomain = senderEmail.split("@")[1] || "";
  const senderName = normalize(sender?.displayName);
  const subject = normalize(item.subject);
  const bodyish = normalize(
    [item.summaryText, item.previewText, item.actionTitle]
      .filter(Boolean)
      .join(" "),
  );

  const hitsIn = (haystack: string) => {
    if (!haystack) return false;
    const collapsedHaystack = collapse(haystack);
    if (projectCollapsed.length >= 4 &&
        collapsedHaystack.includes(projectCollapsed)) {
      return true;
    }
    return projectTokens.some((token) => haystack.includes(token));
  };

  // Highest-value signal first; the first match wins so the reason shown is the
  // strongest one, not an arbitrary one.
  if (senderDomain && hitsIn(senderDomain)) {
    return {
      project,
      score: 100,
      reason: `Sender is @${senderDomain}`,
    };
  }
  if (subject && hitsIn(subject)) {
    return { project, score: 70, reason: "Mentioned in the subject" };
  }
  if (bodyish && hitsIn(bodyish)) {
    return { project, score: 45, reason: "Mentioned in the summary" };
  }
  if (senderName && hitsIn(senderName)) {
    return {
      project,
      score: 30,
      reason: `Sender is ${sender?.displayName}`,
    };
  }
  return null;
}

export function suggestProjectsForInboxItem(
  projects: Project[],
  item: InboxItem,
  limit = 4,
): ProjectSuggestion[] {
  return (projects || [])
    .filter((project) => !project.archived)
    .map((project) => scoreProjectForInboxItem(project, item))
    .filter((suggestion): suggestion is ProjectSuggestion => Boolean(suggestion))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.project.name.localeCompare(right.project.name),
    )
    .slice(0, limit);
}
