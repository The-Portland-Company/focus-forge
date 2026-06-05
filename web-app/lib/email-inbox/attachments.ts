import type { ConversationEntry } from "@/lib/types";

/**
 * A single user-facing attachment, flattened across every message in a thread.
 * `messageId` + `attachmentIndex` map to the streaming download route
 * `/api/email/messages/{messageId}/attachments/{attachmentIndex}`.
 */
export type ThreadAttachment = {
  messageId: string;
  attachmentIndex: number;
  filename: string | null;
  contentType: string | null;
  size: number;
  url: string;
  isImage: boolean;
};

type RawAttachment = NonNullable<ConversationEntry["attachments"]>[number];

/**
 * True when an attachment should be surfaced in the gallery. We hide
 * inline/related parts (e.g. images embedded in the HTML body via `cid:`),
 * which are not real "attachments" from the user's perspective.
 */
export function isGalleryAttachment(attachment: RawAttachment): boolean {
  if (attachment.related) {
    return false;
  }
  if (attachment.contentDisposition === "inline" && attachment.cid) {
    return false;
  }
  return true;
}

export function isImageAttachment(contentType: string | null | undefined): boolean {
  return Boolean(contentType && contentType.toLowerCase().startsWith("image/"));
}

/**
 * Resolve the download URL for an attachment. The sync pipeline already stamps
 * a `url` onto stored attachments; fall back to building the canonical route
 * from the owning message id + index when it is missing.
 */
export function resolveAttachmentUrl(
  messageId: string,
  attachment: RawAttachment,
): string | null {
  if (attachment.url) {
    return attachment.url;
  }
  if (typeof attachment.attachmentIndex === "number") {
    return `/api/email/messages/${messageId}/attachments/${attachment.attachmentIndex}`;
  }
  return null;
}

/**
 * Flatten every gallery-eligible attachment across all messages in a thread
 * into a single ordered list suitable for the lightbox gallery.
 */
export function collectThreadAttachments(
  conversation: ConversationEntry[] | null | undefined,
): ThreadAttachment[] {
  if (!conversation?.length) {
    return [];
  }

  const collected: ThreadAttachment[] = [];

  for (const entry of conversation) {
    const attachments = entry.attachments || [];
    attachments.forEach((attachment, fallbackIndex) => {
      if (!isGalleryAttachment(attachment)) {
        return;
      }
      const url = resolveAttachmentUrl(entry.id, attachment);
      if (!url) {
        return;
      }
      const attachmentIndex =
        typeof attachment.attachmentIndex === "number"
          ? attachment.attachmentIndex
          : fallbackIndex;
      collected.push({
        messageId: entry.id,
        attachmentIndex,
        filename: attachment.filename ?? null,
        contentType: attachment.contentType ?? null,
        size: attachment.size ?? 0,
        url,
        isImage: isImageAttachment(attachment.contentType),
      });
    });
  }

  return collected;
}

/** Human-readable byte size, e.g. "1.4 MB". */
export function formatAttachmentSize(bytes: number): string {
  if (!bytes || bytes <= 0) {
    return "";
  }
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const rounded = value >= 10 || unitIndex === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unitIndex]}`;
}
