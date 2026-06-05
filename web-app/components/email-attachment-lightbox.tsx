"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Forward,
  Loader2,
  Printer,
  X,
} from "lucide-react";
import {
  formatAttachmentSize,
  type ThreadAttachment,
} from "@/lib/email-inbox/attachments";
import { cn } from "@/lib/utils";

type EmailAttachmentLightboxProps = {
  open: boolean;
  attachments: ThreadAttachment[];
  loading?: boolean;
  error?: string | null;
  /** Optional title shown in the gallery header (e.g. the email subject). */
  title?: string | null;
  onClose: () => void;
  /**
   * Forward handler. If omitted, the Forward action is hidden. The parent owns
   * the compose/forward pipeline (see email-inbox-view "New Email" flow).
   */
  onForward?: (attachment: ThreadAttachment) => void;
};

function triggerPrint(url: string) {
  // Print images by loading them into a hidden iframe and invoking print on
  // that frame's window. This avoids a popup-blocker-prone window.open call.
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");

  iframe.onload = () => {
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(
      `<html><head><style>@page{margin:0}body{margin:0;display:flex;align-items:center;justify-content:center}img{max-width:100%;max-height:100vh}</style></head><body><img src="${url}" /></body></html>`,
    );
    doc.close();
    const win = iframe.contentWindow;
    if (!win) return;
    const img = doc.querySelector("img");
    const run = () => {
      win.focus();
      win.print();
      window.setTimeout(() => iframe.remove(), 1000);
    };
    if (img && !img.complete) {
      img.addEventListener("load", run, { once: true });
      img.addEventListener("error", run, { once: true });
    } else {
      run();
    }
  };

  document.body.appendChild(iframe);
}

export function EmailAttachmentLightbox({
  open,
  attachments,
  loading = false,
  error = null,
  title,
  onClose,
  onForward,
}: EmailAttachmentLightboxProps) {
  // Index of the attachment shown in the fullscreen viewer; null = grid view.
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset to grid view whenever the gallery is (re)opened.
  useEffect(() => {
    if (open) {
      setActiveIndex(null);
    }
  }, [open]);

  const imageCount = attachments.filter((a) => a.isImage).length;

  const showPrev = useCallback(() => {
    setActiveIndex((current) => {
      if (current === null || attachments.length === 0) return current;
      return (current - 1 + attachments.length) % attachments.length;
    });
  }, [attachments.length]);

  const showNext = useCallback(() => {
    setActiveIndex((current) => {
      if (current === null || attachments.length === 0) return current;
      return (current + 1) % attachments.length;
    });
  }, [attachments.length]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (activeIndex !== null) {
          setActiveIndex(null);
        } else {
          onClose();
        }
      } else if (event.key === "ArrowLeft" && activeIndex !== null) {
        showPrev();
      } else if (event.key === "ArrowRight" && activeIndex !== null) {
        showNext();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, activeIndex, onClose, showPrev, showNext]);

  if (!open || !mounted) {
    return null;
  }

  const active = activeIndex !== null ? attachments[activeIndex] : null;

  const renderActions = (attachment: ThreadAttachment) => (
    <div className="flex items-center gap-1.5">
      <a
        href={attachment.url}
        download={attachment.filename || "attachment"}
        onClick={(event) => event.stopPropagation()}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800/80 text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-white"
        title="Download"
        aria-label="Download attachment"
      >
        <Download className="h-4 w-4" />
      </a>
      {attachment.isImage ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            triggerPrint(attachment.url);
          }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800/80 text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-white"
          title="Print"
          aria-label="Print attachment"
        >
          <Printer className="h-4 w-4" />
        </button>
      ) : null}
      {onForward ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onForward(attachment);
          }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800/80 text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-white"
          title="Forward"
          aria-label="Forward attachment"
        >
          <Forward className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex flex-col bg-black/85 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Attachment gallery"
      onClick={() => {
        // Click outside closes: grid view closes the gallery; fullscreen
        // returns to the grid first.
        if (activeIndex !== null) {
          setActiveIndex(null);
        } else {
          onClose();
        }
      }}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800/80 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-zinc-200">
            {title?.trim() || "Attachments"}
          </div>
          <div className="text-xs text-zinc-500">
            {attachments.length} attachment{attachments.length === 1 ? "" : "s"}
            {imageCount > 0 ? ` · ${imageCount} image${imageCount === 1 ? "" : "s"}` : ""}
          </div>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
          aria-label="Close gallery"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center text-zinc-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading attachments…
        </div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-rose-400">
          {error}
        </div>
      ) : attachments.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
          No attachments found.
        </div>
      ) : active ? (
        // Fullscreen single-attachment viewer
        <div
          className="relative flex flex-1 items-center justify-center overflow-hidden p-6"
          onClick={(event) => event.stopPropagation()}
        >
          {attachments.length > 1 ? (
            <button
              type="button"
              onClick={showPrev}
              className="absolute left-4 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-zinc-900/80 text-zinc-200 transition-colors hover:bg-zinc-800"
              aria-label="Previous attachment"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          ) : null}

          <div className="flex max-h-full max-w-full flex-col items-center gap-4">
            {active.isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={active.url}
                alt={active.filename || "Attachment"}
                className="max-h-[78vh] max-w-full rounded-lg object-contain shadow-2xl"
              />
            ) : (
              <div className="flex flex-col items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 px-10 py-12 text-center">
                <FileText className="h-16 w-16 text-zinc-500" />
                <div className="max-w-xs truncate text-sm font-medium text-zinc-200">
                  {active.filename || "Attachment"}
                </div>
                <div className="text-xs text-zinc-500">
                  {active.contentType || "File"}
                  {active.size > 0 ? ` · ${formatAttachmentSize(active.size)}` : ""}
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="max-w-[40vw] truncate text-sm text-zinc-300">
                {active.filename || "Attachment"}
              </div>
              {renderActions(active)}
            </div>
          </div>

          {attachments.length > 1 ? (
            <button
              type="button"
              onClick={showNext}
              className="absolute right-4 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-zinc-900/80 text-zinc-200 transition-colors hover:bg-zinc-800"
              aria-label="Next attachment"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          ) : null}
        </div>
      ) : (
        // Grid of thumbnails
        <div
          className="flex-1 overflow-auto p-4 sm:p-6"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {attachments.map((attachment, index) => (
              <div
                key={`${attachment.messageId}-${attachment.attachmentIndex}`}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/70"
              >
                <button
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={cn(
                    "relative flex aspect-square w-full items-center justify-center bg-zinc-950 transition-colors hover:bg-zinc-900",
                  )}
                  aria-label={`Open ${attachment.filename || "attachment"}`}
                >
                  {attachment.isImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={attachment.url}
                      alt={attachment.filename || "Attachment"}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 px-3 text-center">
                      <FileText className="h-10 w-10 text-zinc-500" />
                      <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                        {(attachment.contentType?.split("/").pop() || "file").slice(0, 8)}
                      </span>
                    </div>
                  )}
                </button>
                <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium text-zinc-200">
                      {attachment.filename || "Attachment"}
                    </div>
                    {attachment.size > 0 ? (
                      <div className="truncate text-[10px] text-zinc-500">
                        {formatAttachmentSize(attachment.size)}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                  {renderActions(attachment)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
