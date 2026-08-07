/**
 * Explains threads that leave the inbox on their own, right after the user
 * touched them.
 *
 * Assigning a project calls `reprocessThread()` on the server, which re-runs
 * the rules and the AI classifier. That can land on a status the inbox view
 * filters out — quarantine, archived, resolved, deleted. The next refresh then
 * simply drops the row. In the reported recording, the user assigned a project
 * to the top email and, seconds later, it and another thread silently vanished
 * ("Hey Spencer" → quarantine; "Bid Proposal Invitation" → archived), leaving
 * no trace of where they went or why.
 *
 * Rows are still allowed to leave — a quarantined thread does not belong in the
 * inbox. What was missing is the explanation. This resolves which
 * just-touched threads departed and where to, so the view can say so.
 */

/** Statuses that remove a thread from the main inbox list, and where it went. */
export const INBOX_DEPARTURE_DESTINATIONS: Record<string, string> = {
  quarantine: "Quarantine",
  archived: "Archive",
  resolved: "Resolved",
  deleted: "Trash",
  spam: "Spam",
};

/** How long after touching a thread its departure is still worth explaining. */
export const DEPARTURE_EXPLANATION_WINDOW_MS = 20_000;

export type DepartureRow = {
  id: string;
  subject?: string | null;
  status?: string | null;
};

export type ThreadDeparture = {
  threadId: string;
  subject: string;
  status: string;
  destination: string;
};

function isInInbox(status: string | null | undefined): boolean {
  if (!status) return true;
  return !(status in INBOX_DEPARTURE_DESTINATIONS);
}

/**
 * Threads the user touched recently that were in the inbox before this snapshot
 * and are not after it.
 *
 * A thread missing from `nextItems` entirely is deliberately NOT reported:
 * `/api/email/inbox` returns every status, and the recency-capped window means
 * an absent row usually fell off the end of the list rather than changed state.
 * Only an observed status transition is reported, so the message is never a
 * guess.
 */
export function listExplainedDepartures(params: {
  previousItems: DepartureRow[];
  nextItems: DepartureRow[];
  /** thread id → epoch ms the user last acted on it */
  touchedAt: Map<string, number>;
  nowMs: number;
  windowMs?: number;
}): ThreadDeparture[] {
  const { previousItems, nextItems, touchedAt, nowMs } = params;
  const windowMs = params.windowMs ?? DEPARTURE_EXPLANATION_WINDOW_MS;
  if (touchedAt.size === 0) return [];

  const previousById = new Map(previousItems.map((item) => [item.id, item]));
  const departures: ThreadDeparture[] = [];

  for (const next of nextItems) {
    const touchedMs = touchedAt.get(next.id);
    if (touchedMs === undefined || nowMs - touchedMs > windowMs) continue;

    const previous = previousById.get(next.id);
    if (!previous || !isInInbox(previous.status)) continue;
    if (isInInbox(next.status)) continue;

    const status = String(next.status);
    departures.push({
      threadId: next.id,
      subject: (next.subject || previous.subject || "").trim(),
      status,
      destination: INBOX_DEPARTURE_DESTINATIONS[status] || status,
    });
  }

  return departures;
}

/** Human-readable one-liner for the status bar. */
export function describeDepartures(departures: ThreadDeparture[]): string | null {
  if (departures.length === 0) return null;
  if (departures.length === 1) {
    const [only] = departures;
    const label = only.subject ? `“${only.subject}”` : "That email";
    return `${label} moved to ${only.destination}.`;
  }
  const destinations = Array.from(
    new Set(departures.map((departure) => departure.destination)),
  );
  return `${departures.length} emails moved to ${destinations.join(" / ")}.`;
}
