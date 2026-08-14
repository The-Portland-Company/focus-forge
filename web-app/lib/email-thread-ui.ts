import type {
  ConversationEntry,
  ConversationRecipient,
  ConversationRecipientContact,
} from "@/lib/types";

const EMAIL_AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #f97316 0%, #ef4444 100%)",
  "linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)",
  "linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)",
  "linear-gradient(135deg, #0ea5e9 0%, #14b8a6 100%)",
  "linear-gradient(135deg, #22c55e 0%, #3b82f6 100%)",
  "linear-gradient(135deg, #eab308 0%, #f97316 100%)",
] as const;

function hashValue(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

export function getEmailActorName(
  name?: string | null,
  email?: string | null,
  fallback = "Unknown sender",
) {
  const trimmedName = name?.trim();

  if (trimmedName) {
    return trimmedName;
  }

  const trimmedEmail = email?.trim();
  return trimmedEmail || fallback;
}

export function getEmailActorInitials(
  name?: string | null,
  email?: string | null,
) {
  const source = getEmailActorName(name, email, "U")
    .replace(/<[^>]+>/g, " ")
    .replace(/[@._-]+/g, " ")
    .trim();

  if (!source) {
    return "U";
  }

  const parts = source.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase();
}

export function getEmailActorGradient(
  name?: string | null,
  email?: string | null,
) {
  const seed = `${name || ""}:${email || ""}`;
  return EMAIL_AVATAR_GRADIENTS[
    hashValue(seed) % EMAIL_AVATAR_GRADIENTS.length
  ];
}

export function getPrimaryThreadRenderEntry(
  conversation?: ConversationEntry[] | null,
) {
  if (!conversation?.length) {
    return null;
  }

  // The "primary" entry anchors the body / AI Summary panel. It must be the
  // FIRST email in the thread (the original message), not the latest — sending
  // a reply otherwise replaces the body with the user's own reply. Replies and
  // later messages flow into the Conversation list via
  // getConversationEntriesExcludingPrimary().
  for (let index = 0; index < conversation.length; index += 1) {
    const entry = conversation[index];
    if (entry?.type === "email") {
      return entry;
    }
  }

  return conversation[0] || null;
}

export function getConversationEntriesExcludingPrimary(
  conversation?: ConversationEntry[] | null,
) {
  const primaryEntry = getPrimaryThreadRenderEntry(conversation);
  if (!conversation?.length || !primaryEntry) {
    return conversation || [];
  }

  return conversation.filter((entry) => entry.id !== primaryEntry.id);
}

function dedupeRecipients(recipients?: ConversationRecipient[] | null) {
  const seen = new Set<string>();

  return (recipients || []).filter((address) => {
    const key = (address?.email || "").trim().toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/** To / Cc / Bcc recipients for the thread header, de-duplicated by address. An
 *  empty array is the signal for the header to omit that row entirely — which is
 *  the normal case for Bcc on received mail (inbound copies carry no Bcc header)
 *  and for messages synced before these fields were stored. */
export function getThreadHeaderToActors(entry?: ConversationEntry | null) {
  return dedupeRecipients(entry?.to);
}

export function getThreadHeaderCcActors(entry?: ConversationEntry | null) {
  return dedupeRecipients(entry?.cc);
}

export function getThreadHeaderBccActors(entry?: ConversationEntry | null) {
  return dedupeRecipients(entry?.bcc);
}

/** What a recipient badge shows: a person's name when Contacts knows them, their
 *  company as a secondary bit when recorded, and always the raw address for the
 *  hover title. Falls back to the envelope display name, then to the email
 *  itself, so an unmatched recipient still renders something meaningful. */
export function getRecipientBadge(recipient: ConversationRecipient) {
  const email = (recipient?.email || "").trim();
  const contact = recipient?.contact ?? null;
  const fullName = [contact?.firstName, contact?.lastName]
    .map((part) => (part || "").trim())
    .filter(Boolean)
    .join(" ");
  const company = (contact?.company || "").trim();

  return {
    label:
      fullName ||
      (contact?.displayName || "").trim() ||
      (recipient?.name || "").trim() ||
      email,
    company: company || null,
    email,
  };
}

/** Cross-reference envelope recipients against contacts already fetched in one
 *  batched query, keyed by lowercased email. Kept separate from the query so the
 *  matching rules stay testable and the read path never turns into an N+1. */
export function attachContactsToRecipients(
  recipients: ConversationRecipient[] | null | undefined,
  contactsByEmail: Map<string, ConversationRecipientContact>,
): ConversationRecipient[] {
  return (recipients || []).map((recipient) => {
    const contact =
      contactsByEmail.get((recipient?.email || "").trim().toLowerCase()) ?? null;
    return { ...recipient, contact };
  });
}

export function getDisplayableThreadAttachments(
  entry?: ConversationEntry | null,
) {
  return (entry?.attachments || []).filter((attachment) => {
    if (attachment.related) {
      return false;
    }

    if (attachment.contentDisposition === "inline" && attachment.cid) {
      return false;
    }

    return true;
  });
}

export function isPreviewableThreadAttachment(attachment: {
  contentType?: string | null;
  url?: string | null;
}) {
  return Boolean(
    attachment.url &&
      attachment.contentType &&
      attachment.contentType.toLowerCase().startsWith("image/"),
  );
}
