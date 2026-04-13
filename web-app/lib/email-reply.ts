import type { EmailReplyDraftAttachment } from "@/lib/types";
import { richTextToPlainText } from "@/lib/rich-text";
import { normalizeRichText } from "@/lib/rich-text-sanitize";

export type EmailReplyAttachment = EmailReplyDraftAttachment;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export function formatReplyAttachmentSize(sizeBytes?: number) {
  if (!sizeBytes) return "";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isInlineAttachmentEligible(
  attachment: Pick<EmailReplyAttachment, "mimeType" | "name" | "type">,
) {
  const mimeType = attachment.mimeType?.toLowerCase() || "";
  if (mimeType.startsWith("image/")) return true;

  const fileType = attachment.type?.toLowerCase() || "";
  const extension = attachment.name.split(".").pop()?.toLowerCase() || "";

  return fileType === "pdf" || extension === "pdf";
}

function plainTextToHtml(value: string) {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

function buildInlineAttachmentHtml(attachments: EmailReplyAttachment[]) {
  const inlineAttachments = attachments.filter(
    (attachment) => attachment.inline && attachment.publicUrl,
  );

  if (inlineAttachments.length === 0) {
    return "";
  }

  const content = inlineAttachments
    .map((attachment) => {
      const fileName = escapeHtml(attachment.name);
      const publicUrl = escapeHtml(attachment.publicUrl || "");
      if ((attachment.mimeType || "").toLowerCase().startsWith("image/")) {
        return `<figure><img src="${publicUrl}" alt="${fileName}" /><figcaption>${fileName}</figcaption></figure>`;
      }

      return `<p><a href="${publicUrl}" target="_blank" rel="noopener noreferrer">${fileName}</a></p>`;
    })
    .join("");

  return `<div>${content}</div>`;
}

export function buildReplyHtml(params: {
  contentHtml: string;
  signatureText?: string | null;
  attachments?: EmailReplyAttachment[];
}) {
  const sections = [normalizeRichText(params.contentHtml)];

  if (params.signatureText?.trim()) {
    sections.push(plainTextToHtml(params.signatureText.trim()));
  }

  if (params.attachments?.length) {
    sections.push(buildInlineAttachmentHtml(params.attachments));
  }

  return sections.filter(Boolean).join("");
}

export function buildReplyPlainText(params: {
  contentHtml: string;
  signatureText?: string | null;
  attachments?: EmailReplyAttachment[];
}) {
  const sections = [richTextToPlainText(params.contentHtml)];

  if (params.signatureText?.trim()) {
    sections.push(params.signatureText.trim());
  }

  const inlineAttachments = (params.attachments || []).filter(
    (attachment) => attachment.inline && attachment.publicUrl,
  );

  if (inlineAttachments.length > 0) {
    sections.push(
      inlineAttachments
        .map((attachment) =>
          attachment.publicUrl
            ? `${attachment.name}: ${attachment.publicUrl}`
            : attachment.name,
        )
        .join("\n"),
    );
  }

  return sections.filter(Boolean).join("\n\n").trim();
}
