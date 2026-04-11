import type { ConversationEntry } from "@/lib/types";

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

  for (let index = conversation.length - 1; index >= 0; index -= 1) {
    const entry = conversation[index];
    if (entry?.type === "email") {
      return entry;
    }
  }

  return conversation[conversation.length - 1] || null;
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
