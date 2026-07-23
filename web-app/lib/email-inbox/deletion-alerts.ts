/**
 * Copy + error-mapping for email-deletion alerts. Extracted from the retired
 * bottom-centre EmailDeleteTray — deletions now report through the top-right
 * alert center (components/alert-center.tsx).
 */

export type PendingDeletionStatus = "deleting" | "succeeded" | "failed";

export interface PendingDeletion {
  /** Stable key for this pending delete (threadId + action). */
  id: string;
  threadId: string;
  action: string;
  sender: string;
  subject: string;
  status: PendingDeletionStatus;
  /** Raw server/network error message (only when status === "failed"). */
  error?: string;
}

/**
 * Maps a raw error message to a plain-language explanation plus a short hint
 * about what the user can do next. Falls back to the raw message so we never
 * hide the underlying cause.
 */
export function describeDeletionError(error?: string): {
  summary: string;
  hint: string;
} {
  const raw = (error || "").trim();
  const lower = raw.toLowerCase();

  if (!raw) {
    return {
      summary: "The delete didn't go through, but no reason was reported.",
      hint: "Try again, or report this so we can dig in.",
    };
  }

  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed") ||
    lower.includes("load failed")
  ) {
    return {
      summary: "Couldn't reach the server — this looks like a network issue.",
      hint: "Check your connection and retry.",
    };
  }

  if (lower.includes("unauthorized") || lower.includes("401")) {
    return {
      summary: "Your session expired, so the delete wasn't authorized.",
      hint: "Refresh the page to sign back in, then retry.",
    };
  }

  if (lower.includes("forbidden") || lower.includes("403")) {
    return {
      summary: "You don't have permission to delete this email.",
      hint: "If this is unexpected, report it.",
    };
  }

  if (lower.includes("not found") || lower.includes("404")) {
    return {
      summary: "The email couldn't be found on the server.",
      hint: "It may already be gone. Refresh to confirm.",
    };
  }

  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("504")
  ) {
    return {
      summary: "The server took too long to respond.",
      hint: "Retry in a moment.",
    };
  }

  if (
    lower.includes("500") ||
    lower.includes("internal server") ||
    lower.includes("502") ||
    lower.includes("503")
  ) {
    return {
      summary: "The server hit an error while deleting this email.",
      hint: "Retry, or report it if it keeps happening.",
    };
  }

  return {
    summary: raw,
    hint: "Retry, or report this if it persists.",
  };
}

/** Headline copy per state — "{verb} {Subject} from {Who}". */
export function describeDeletionHeadline(
  item: Pick<PendingDeletion, "status" | "subject" | "sender">,
): string {
  const subject = item.subject || "(no subject)";
  const sender = item.sender || "Unknown sender";
  if (item.status === "succeeded") return `Deleted ${subject} from ${sender}`;
  if (item.status === "failed")
    return `Couldn't delete ${subject} from ${sender}`;
  return `Deleting ${subject} from ${sender}`;
}
