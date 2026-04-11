"use client";

import { useMemo, useState } from "react";
import { ExternalLink, FileText, Paperclip } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatReplyAttachmentSize } from "@/lib/email-reply";
import { isPreviewableThreadAttachment } from "@/lib/email-thread-ui";
import type { ConversationEntry } from "@/lib/types";

type ThreadAttachment = NonNullable<ConversationEntry["attachments"]>[number];

type EmailThreadAttachmentsProps = {
  attachments: ThreadAttachment[];
};

export function EmailThreadAttachments({
  attachments,
}: EmailThreadAttachmentsProps) {
  const [activeAttachment, setActiveAttachment] = useState<ThreadAttachment | null>(
    null,
  );

  const { imageAttachments, fileAttachments } = useMemo(
    () => ({
      imageAttachments: attachments.filter((attachment) =>
        isPreviewableThreadAttachment(attachment),
      ),
      fileAttachments: attachments.filter(
        (attachment) => !isPreviewableThreadAttachment(attachment),
      ),
    }),
    [attachments],
  );

  if (attachments.length === 0) {
    return null;
  }

  return (
    <>
      <div className="mt-4 border-t border-zinc-800 pt-3">
        <div className="mb-2 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
          <Paperclip className="h-3.5 w-3.5" />
          <span>
            {attachments.length} attachment{attachments.length === 1 ? "" : "s"}
          </span>
        </div>

        {imageAttachments.length > 0 ? (
          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            {imageAttachments.map((attachment) => (
              <button
                key={`${attachment.filename || "attachment"}-${attachment.attachmentIndex || 0}`}
                type="button"
                onClick={() => setActiveAttachment(attachment)}
                className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/70 text-left transition-colors hover:border-zinc-700"
              >
                <div className="relative aspect-[4/3] w-full bg-zinc-950">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={attachment.url || ""}
                    alt={attachment.filename || "Attachment preview"}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="flex items-center gap-3 px-3 py-2 text-sm text-zinc-300">
                  <FileText className="h-4 w-4 shrink-0 text-zinc-400" />
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

        {fileAttachments.length > 0 ? (
          <div className="space-y-2">
            {fileAttachments.map((attachment) => (
              <a
                key={`${attachment.filename || "attachment"}-${attachment.attachmentIndex || 0}`}
                href={attachment.url || undefined}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-700"
              >
                <FileText className="h-4 w-4 shrink-0 text-zinc-400" />
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
                <ExternalLink className="h-4 w-4 shrink-0 text-zinc-500" />
              </a>
            ))}
          </div>
        ) : null}
      </div>

      <Dialog
        open={Boolean(activeAttachment)}
        onOpenChange={(open) => {
          if (!open) {
            setActiveAttachment(null);
          }
        }}
      >
        <DialogContent className="w-[min(96vw,72rem)] max-w-[72rem] border-zinc-800 bg-zinc-950 p-4 text-white sm:rounded-2xl">
          <DialogTitle className="truncate pr-8 text-base text-white">
            {activeAttachment?.filename || "Attachment preview"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Attachment preview dialog
          </DialogDescription>
          {activeAttachment?.url ? (
            <div className="flex max-h-[80vh] items-center justify-center overflow-auto rounded-xl bg-zinc-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activeAttachment.url}
                alt={activeAttachment.filename || "Attachment preview"}
                className="h-auto max-h-[80vh] w-auto max-w-full object-contain"
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
