"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Film,
  ImageIcon,
  Loader2,
  Music,
  Paperclip,
  X,
} from "lucide-react";
import { formatReplyAttachmentSize } from "@/lib/email-reply";
import { isPreviewableThreadAttachment } from "@/lib/email-thread-ui";
import {
  classifyAttachmentKind,
  isInlineDocKind,
  type AttachmentKind,
} from "@/lib/email-inbox/attachments";
import { AttachmentDocPreview } from "@/components/attachment-doc-preview";
import type { ConversationEntry } from "@/lib/types";

type ThreadAttachment = NonNullable<ConversationEntry["attachments"]>[number];

type EmailThreadAttachmentsProps = {
  attachments: ThreadAttachment[];
  /** Open the section expanded by default. Defaults to collapsed. */
  defaultOpen?: boolean;
};

function getAttachmentKind(attachment: {
  contentType?: string | null;
  filename?: string | null;
}): AttachmentKind {
  return classifyAttachmentKind(attachment);
}

function AttachmentKindIcon({ kind }: { kind: AttachmentKind }) {
  const className = "h-6 w-6 text-zinc-400";
  switch (kind) {
    case "image":
      return <ImageIcon className={className} />;
    case "video":
      return <Film className={className} />;
    case "audio":
      return <Music className={className} />;
    default:
      return <FileText className={className} />;
  }
}

function AttachmentFullscreenPreview({
  attachment,
  onClose,
}: {
  attachment: ThreadAttachment;
  onClose: () => void;
}) {
  const kind = getAttachmentKind(attachment);
  const url = attachment.url || "";
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textError, setTextError] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (kind !== "text" || !url) return;

    let cancelled = false;
    setLoadingText(true);
    setTextError(null);
    setTextContent(null);

    fetch(url, { credentials: "include" })
      .then((response) => {
        if (!response.ok) throw new Error(`Failed to load (${response.status})`);
        return response.text();
      })
      .then((value) => {
        if (!cancelled) setTextContent(value);
      })
      .catch((error) => {
        if (!cancelled) {
          setTextError(
            error instanceof Error ? error.message : "Failed to load text",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingText(false);
      });

    return () => {
      cancelled = true;
    };
  }, [kind, url]);

  return (
    <div
      className="fixed inset-0 z-[120] flex flex-col bg-black/90 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={attachment.filename || "Attachment preview"}
    >
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
        <div className="min-w-0 truncate text-sm font-medium text-zinc-100">
          {attachment.filename || "Attachment preview"}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {url ? (
            <a
              href={url}
              download={attachment.filename || undefined}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Download</span>
            </a>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-auto p-4">
        {!url ? (
          <div className="text-sm text-zinc-400">
            No preview available for this attachment.
          </div>
        ) : kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={attachment.filename || "Attachment preview"}
            className="max-h-full max-w-full object-contain"
          />
        ) : kind === "video" ? (
          <video
            src={url}
            controls
            className="max-h-full max-w-full"
            preload="metadata"
          />
        ) : kind === "audio" ? (
          <audio src={url} controls className="w-full max-w-2xl" />
        ) : kind === "pdf" || isInlineDocKind(kind) ? (
          <div className="h-full w-full max-w-6xl">
            <AttachmentDocPreview
              url={url}
              filename={attachment.filename}
              contentType={attachment.contentType}
              kind={kind}
            />
          </div>
        ) : kind === "text" ? (
          <div className="h-full w-full max-w-4xl overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4">
            {loadingText ? (
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : textError ? (
              <div className="text-sm text-red-300">{textError}</div>
            ) : (
              <pre className="whitespace-pre-wrap break-words text-xs leading-5 text-zinc-200">
                {textContent}
              </pre>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <FileText className="h-12 w-12 text-zinc-500" />
            <div className="text-sm text-zinc-300">
              No inline preview for this file type.
            </div>
            <a
              href={url}
              download={attachment.filename || undefined}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
            >
              <Download className="h-4 w-4" />
              Download
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export function EmailThreadAttachments({
  attachments,
  defaultOpen = false,
}: EmailThreadAttachmentsProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [activeAttachment, setActiveAttachment] =
    useState<ThreadAttachment | null>(null);

  const cards = useMemo(
    () =>
      attachments.map((attachment) => ({
        attachment,
        kind: getAttachmentKind(attachment),
        isImage: isPreviewableThreadAttachment(attachment),
      })),
    [attachments],
  );

  if (attachments.length === 0) {
    return null;
  }

  return (
    <>
      <div className="mt-2 border-t border-zinc-800 pt-3">
        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          aria-expanded={isOpen}
          className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-400 transition-colors hover:text-zinc-200"
        >
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          <Paperclip className="h-3.5 w-3.5" />
          <span>
            Attachments ({attachments.length})
          </span>
        </button>

        {isOpen ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map(({ attachment, kind, isImage }) => (
              <button
                key={`${attachment.filename || "attachment"}-${attachment.attachmentIndex ?? 0}`}
                type="button"
                onClick={() => setActiveAttachment(attachment)}
                className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/70 text-left transition-colors hover:border-zinc-700"
              >
                <div className="relative flex aspect-[4/3] w-full items-center justify-center bg-zinc-950">
                  {isImage && attachment.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={attachment.url}
                      alt={attachment.filename || "Attachment preview"}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <AttachmentKindIcon kind={kind} />
                  )}
                </div>
                <div className="flex items-center gap-3 px-3 py-2 text-sm text-zinc-300">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-zinc-200">
                      {attachment.filename || "Unnamed attachment"}
                    </div>
                    <div className="truncate text-xs text-zinc-500">
                      {attachment.contentType || "Attachment"}
                      {attachment.size > 0
                        ? ` · ${formatReplyAttachmentSize(attachment.size)}`
                        : ""}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {activeAttachment ? (
        <AttachmentFullscreenPreview
          attachment={activeAttachment}
          onClose={() => setActiveAttachment(null)}
        />
      ) : null}
    </>
  );
}
