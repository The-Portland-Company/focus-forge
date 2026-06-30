import type { InboxParticipant } from "@/lib/types";

/**
 * Parsed name/email pair extracted from an RFC 5322-ish address string.
 *
 * Both fields are trimmed; either may be an empty string when it could not be
 * determined from the input.
 */
export type ParsedAddress = {
  name: string;
  email: string;
};

const ANGLE_ADDR = /^(.*?)<([^>]*)>\s*$/;
const BARE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Parse a single From/To-style address string into a display name and email.
 *
 * Handles the common shapes that show up in real mail headers:
 *  - `Dan Clemens <dan@example.com>`
 *  - `"Clemens, Dan" <dan@example.com>` (quoted display name)
 *  - `dan@example.com` (bare address)
 *  - `<dan@example.com>` (angle-wrapped, no name)
 *
 * Surrounding quotes are stripped from the display name. When the "name"
 * portion is itself just the email (some clients duplicate it), the name is
 * dropped so callers can fall back cleanly. Never throws.
 */
export function parseAddressString(raw: string | null | undefined): ParsedAddress {
  const value = (raw ?? "").trim();
  if (!value) {
    return { name: "", email: "" };
  }

  const angleMatch = value.match(ANGLE_ADDR);
  if (angleMatch) {
    const name = stripQuotes(angleMatch[1].trim());
    const email = angleMatch[2].trim().toLowerCase();
    // If the "name" is actually the same address, drop it.
    return {
      name: name && name.toLowerCase() !== email ? name : "",
      email,
    };
  }

  // No angle brackets. If the whole thing looks like a bare email, treat it as
  // the email; otherwise it's a name-only value.
  if (BARE_EMAIL.test(value)) {
    return { name: "", email: value.toLowerCase() };
  }

  // Could be `name email@x.com` without brackets — grab a trailing token that
  // looks like an email, treat the rest as the name.
  const tokens = value.split(/\s+/);
  const last = tokens[tokens.length - 1];
  if (tokens.length > 1 && BARE_EMAIL.test(last)) {
    return {
      name: stripQuotes(tokens.slice(0, -1).join(" ").trim()),
      email: last.toLowerCase(),
    };
  }

  return { name: stripQuotes(value), email: "" };
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/**
 * Normalize a participant so the inbox never renders "Unknown sender" when any
 * identifying info exists. If `displayName` or `emailAddress` is empty but the
 * other field carries a raw header string (e.g. `Dan <dan@x.com>` accidentally
 * stored in display_name), parse it apart and backfill the missing piece.
 */
export function normalizeParticipant(
  participant: InboxParticipant,
): InboxParticipant {
  const rawEmail = (participant.emailAddress ?? "").trim();
  const rawName = (participant.displayName ?? "").trim();

  // Case 1: emailAddress field actually holds a full "Name <email>" header.
  if (rawEmail.includes("<") || (!rawName && rawEmail.includes(" "))) {
    const parsed = parseAddressString(rawEmail);
    if (parsed.email) {
      return {
        ...participant,
        emailAddress: parsed.email,
        displayName: rawName || parsed.name || null,
      };
    }
  }

  // Case 2: no email, but the display name holds a parseable address.
  if (!rawEmail && rawName) {
    const parsed = parseAddressString(rawName);
    if (parsed.email) {
      return {
        ...participant,
        emailAddress: parsed.email,
        displayName: parsed.name || null,
      };
    }
  }

  return participant;
}

/**
 * Score how useful a "from" participant is for display. Higher is better.
 * Prefers entries that have an email address (so the inbox can always show at
 * least the address), then those that also have a name.
 */
function participantScore(participant: InboxParticipant): number {
  const hasEmail = Boolean((participant.emailAddress ?? "").trim());
  const hasName = Boolean((participant.displayName ?? "").trim());
  return (hasEmail ? 2 : 0) + (hasName ? 1 : 0);
}

/**
 * Pick the best "from" participant to display for a thread.
 *
 * Selection rules, in order:
 *  1. Only consider participants with role "from".
 *  2. Normalize each (parse raw header strings into name/email).
 *  3. Prefer the entry with the most usable data (email, then name). The list
 *     is assumed to be in chronological-ish order, so ties resolve to the LAST
 *     (most recent) qualifying sender via a stable max scan.
 *
 * Returns a normalized participant, or null when there are no "from" entries.
 */
export function selectPrimarySender(
  participants: InboxParticipant[] | undefined | null,
  // Addresses belonging to the viewing mailbox (the owner). A thread row should
  // surface the CORRESPONDENT, not the mailbox owner — so even if the owner
  // sent the most recent message, we display the other party. The owner is used
  // only as a last resort (a thread with no other sender).
  options?: { excludeEmails?: (string | null | undefined)[] },
): InboxParticipant | null {
  const allFrom = (participants || [])
    .filter((participant) => participant.participantRole === "from")
    .map(normalizeParticipant);

  if (allFrom.length === 0) {
    return null;
  }

  const excluded = new Set(
    (options?.excludeEmails || [])
      .map((email) => (email || "").trim().toLowerCase())
      .filter(Boolean),
  );
  const nonOwnerFrom = excluded.size
    ? allFrom.filter(
        (participant) =>
          !excluded.has((participant.emailAddress || "").trim().toLowerCase()),
      )
    : allFrom;
  // Prefer non-owner senders; fall back to all (owner-only threads).
  const fromParticipants = nonOwnerFrom.length ? nonOwnerFrom : allFrom;

  let best = fromParticipants[0];
  let bestScore = participantScore(best);

  for (let index = 1; index < fromParticipants.length; index += 1) {
    const candidate = fromParticipants[index];
    const score = participantScore(candidate);
    // >= keeps the most recent (later in the array) on ties.
    if (score >= bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}
