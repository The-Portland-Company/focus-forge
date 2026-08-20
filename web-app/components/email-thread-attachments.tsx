"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  Download,
  File as FileIcon,
  FileText,
  Film,
  ImageIcon,
  Link2,
  Loader2,
  Music,
  Presentation,
  Sheet,
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
};

function getAttachmentKind(attachment: {
  contentType?: string | null;
  filename?: string | null;
}): AttachmentKind {
  return classifyAttachmentKind(attachment);
}

function AttachmentKindIcon({
  kind,
  className = "h-6 w-6 text-zinc-400",
}: {
  kind: AttachmentKind;
  className?: string;
}) {
  switch (kind) {
    case "image":
      return <ImageIcon className={className} />;
    case "video":
      return <Film className={className} />;
    case "audio":
      return <Music className={className} />;
    case "xlsx":
      return <Sheet className={className} />;
    case "pptx":
      return <Presentation className={className} />;
    case "pdf":
    case "docx":
    case "text":
      return <FileText className={className} />;
    default:
      return <FileIcon className={className} />;
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

/**
 * Floating hover preview rendered in a portal so it can never be clipped by the
 * message body's overflow or push the layout around. It is only mounted while a
 * chip is hovered, so the (potentially heavy) `AttachmentDocPreview` for office
 * docs / PDFs is lazily rendered on demand and torn down on mouse leave.
 */
function AttachmentHoverPreview({
  attachment,
  kind,
  isImage,
  anchorRect,
}: {
  attachment: ThreadAttachment;
  kind: AttachmentKind;
  isImage: boolean;
  anchorRect: DOMRect;
}) {
  const WIDTH = 360;
  const HEIGHT = 260;
  const GAP = 8;

  // Prefer showing the popover above the chip; flip below when there isn't room.
  const spaceAbove = anchorRect.top;
  const showBelow = spaceAbove < HEIGHT + GAP + 8;
  const top = showBelow
    ? anchorRect.bottom + GAP
    : anchorRect.top - HEIGHT - GAP;

  // Keep the popover within the viewport horizontally.
  let left = anchorRect.left;
  const maxLeft =
    (typeof window !== "undefined" ? window.innerWidth : WIDTH) - WIDTH - 8;
  if (left > maxLeft) left = Math.max(8, maxLeft);
  if (left < 8) left = 8;

  const url = attachment.url || "";
  const canInlinePreview = isInlineDocKind(kind) && Boolean(url);
  const showImage = isImage && Boolean(url);

  const body = (
    <div
      className="pointer-events-none fixed z-[130] overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl shadow-black/60"
      style={{ top, left, width: WIDTH }}
    >
      {showImage ? (
        <div
          className="flex items-center justify-center bg-zinc-950"
          style={{ height: HEIGHT }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={attachment.filename || "Attachment preview"}
            className="max-h-full max-w-full object-contain"
            loading="lazy"
          />
        </div>
      ) : canInlinePreview ? (
        <div style={{ height: HEIGHT }}>
          <AttachmentDocPreview
            url={url}
            filename={attachment.filename}
            contentType={attachment.contentType}
            kind={kind}
            className="h-full w-full overflow-hidden bg-zinc-950"
          />
        </div>
      ) : (
        <div
          className="flex flex-col items-center justify-center gap-2 p-6 text-center"
          style={{ height: HEIGHT }}
        >
          <AttachmentKindIcon kind={kind} className="h-10 w-10 text-zinc-400" />
          <div className="max-w-full truncate text-sm font-medium text-zinc-200">
            {attachment.filename || "Unnamed attachment"}
          </div>
          <div className="text-xs text-zinc-500">
            {attachment.contentType || "Attachment"}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 border-t border-zinc-800 px-3 py-2">
        <div className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-300">
          {attachment.filename || "Unnamed attachment"}
        </div>
        {attachment.size > 0 ? (
          <div className="shrink-0 text-[11px] text-zinc-500">
            {formatReplyAttachmentSize(attachment.size)}
          </div>
        ) : null}
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(body, document.body);
}

/**
 * A single compact attachment chip: a small type icon + short filename. Click
 * opens the existing fullscreen preview; hover lazily mounts a floating preview.
 */
// Parse the streaming download URL
// (/api/email/messages/{messageId}/attachments/{index}) back into its parts so
// we can mint a public share link for that exact attachment. Returns null when
// the URL isn't the expected shape (e.g. an outbound draft attachment).
function parseAttachmentRef(
  url: string | null | undefined,
): { messageId: string; attachmentIndex: number } | null {
  if (!url) return null;
  const m = url.match(/\/messages\/([^/]+)\/attachments\/(\d+)/);
  if (!m) return null;
  return { messageId: m[1], attachmentIndex: Number(m[2]) };
}

/**
 * Hover control on an attachment chip: "Copy Public URL". Clicking opens a
 * confirm popover ("You are about to generate a public link…") anchored to the
 * chip; on Accept & Copy it mints a public link, copies it to the clipboard,
 * and shows a "Copied!" toast that fades in + up then out. Anyone with the link
 * can open the file with no Focus Forge session.
 */
function AttachmentShareControl({
  attachment,
}: {
  attachment: ThreadAttachment;
}) {
  const ref = parseAttachmentRef(attachment.url);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revokedToast, setRevokedToast] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null = not yet checked; true/false = known link state.
  const [hasLink, setHasLink] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkedRef = useRef(false);

  useEffect(
    () => () => {
      if (toastTimeout.current) clearTimeout(toastTimeout.current);
    },
    [],
  );

  // Attachments that don't resolve to a stored message can't be shared.
  if (!ref) return null;

  const base = `/api/email/messages/${encodeURIComponent(ref.messageId)}/attachments/${ref.attachmentIndex}/public-link`;

  const flashToast = (setter: (v: boolean) => void) => {
    setter(true);
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setter(false), 1500);
  };

  // Lazily reflect current link state the first time the popover opens, so we
  // don't fire a request per chip on page load.
  const ensureChecked = async () => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    setChecking(true);
    try {
      const res = await fetch(base, { method: "GET", credentials: "include" });
      if (res.ok) {
        const body = (await res.json()) as { hasLink?: boolean };
        setHasLink(Boolean(body?.hasLink));
      }
    } catch {
      // Non-fatal — fall back to the create flow.
    } finally {
      setChecking(false);
    }
  };

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(base, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Could not create link");
      }
      const { url } = (await res.json()) as { url?: string };
      if (!url) throw new Error("No link returned");
      await navigator.clipboard.writeText(url);
      setHasLink(true);
      setConfirmOpen(false);
      flashToast(setCopied);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create link");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(base, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Could not revoke link");
      }
      setHasLink(false);
      setConfirmOpen(false);
      flashToast(setRevokedToast);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revoke link");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="pointer-events-none absolute right-0.5 top-0.5 z-20">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setError(null);
          setConfirmOpen((open) => {
            const next = !open;
            if (next) void ensureChecked();
            return next;
          });
        }}
        aria-label="Share public link"
        title="Share public link"
        className="pointer-events-auto inline-flex h-5 w-5 items-center justify-center rounded-md border border-zinc-700 bg-zinc-950/80 text-zinc-300 opacity-0 shadow-sm transition group-hover/att:opacity-100 focus-visible:opacity-100 hover:border-emerald-500 hover:text-emerald-300"
      >
        <Link2 className="h-3 w-3" />
      </button>

      {copied ? (
        <span className="animate-copied-id-toast pointer-events-none absolute -top-6 right-0 z-30 whitespace-nowrap rounded-md bg-emerald-600 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-lg">
          Copied!
        </span>
      ) : null}

      {revokedToast ? (
        <span className="animate-copied-id-toast pointer-events-none absolute -top-6 right-0 z-30 whitespace-nowrap rounded-md bg-zinc-700 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-lg">
          Link revoked
        </span>
      ) : null}

      {confirmOpen ? (
        <div
          role="dialog"
          onClick={(event) => event.stopPropagation()}
          className="pointer-events-auto absolute right-0 top-7 z-40 w-60 rounded-lg border border-zinc-700 bg-zinc-950/95 p-3 text-left shadow-xl backdrop-blur"
        >
          {checking ? (
            <div className="flex items-center gap-2 text-[11px] text-zinc-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Checking link…
            </div>
          ) : hasLink ? (
            <>
              <p className="text-xs leading-snug text-zinc-200">
                This file has an active public link that anyone can open. Copy it
                again, or revoke it so the link stops working.
              </p>
              {error ? (
                <p className="mt-1.5 text-[11px] text-rose-400">{error}</p>
              ) : null}
              <div className="mt-2.5 flex items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={(event) => {
                    event.stopPropagation();
                    void revoke();
                  }}
                  className="rounded-md px-1.5 py-1 text-[11px] font-semibold text-rose-400 transition hover:text-rose-300 disabled:opacity-60"
                >
                  Revoke public link
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={(event) => {
                    event.stopPropagation();
                    void accept();
                  }}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
                >
                  {busy ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )}
                  Copy link
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs leading-snug text-zinc-200">
                You are about to generate a public link for this file so you can
                share it with anyone, do you accept?
              </p>
              {error ? (
                <p className="mt-1.5 text-[11px] text-rose-400">{error}</p>
              ) : null}
              <div className="mt-2.5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setConfirmOpen(false);
                  }}
                  className="rounded-md px-2 py-1 text-[11px] text-zinc-400 transition hover:text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={(event) => {
                    event.stopPropagation();
                    void accept();
                  }}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
                >
                  {busy ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )}
                  Accept &amp; Copy
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </span>
  );
}

function AttachmentChip({
  attachment,
  kind,
  isImage,
  onOpen,
}: {
  attachment: ThreadAttachment;
  kind: AttachmentKind;
  isImage: boolean;
  onOpen: () => void;
}) {
  const chipRef = useRef<HTMLButtonElement | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const openHover = useCallback(() => {
    if (chipRef.current) {
      setAnchorRect(chipRef.current.getBoundingClientRect());
    }
  }, []);
  const closeHover = useCallback(() => setAnchorRect(null), []);

  return (
    <span className="group/att relative inline-flex">
      <button
        ref={chipRef}
        type="button"
        onClick={onOpen}
        onMouseEnter={openHover}
        onMouseLeave={closeHover}
        onFocus={openHover}
        onBlur={closeHover}
        title={attachment.filename || "Attachment"}
        className="inline-flex max-w-[220px] items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/70 py-1 pl-2 pr-7 text-xs text-zinc-300 transition-colors hover:border-zinc-600 hover:bg-zinc-800 hover:text-white"
      >
        <AttachmentKindIcon kind={kind} className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
        <span className="truncate">
          {attachment.filename || "Attachment"}
        </span>
      </button>
      <AttachmentShareControl attachment={attachment} />
      {anchorRect ? (
        <AttachmentHoverPreview
          attachment={attachment}
          kind={kind}
          isImage={isImage}
          anchorRect={anchorRect}
        />
      ) : null}
    </span>
  );
}

export function EmailThreadAttachments({
  attachments,
}: EmailThreadAttachmentsProps) {
  const [activeAttachment, setActiveAttachment] =
    useState<ThreadAttachment | null>(null);

  const chips = useMemo(
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
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {chips.map(({ attachment, kind, isImage }) => (
          <AttachmentChip
            key={`${attachment.filename || "attachment"}-${attachment.attachmentIndex ?? 0}`}
            attachment={attachment}
            kind={kind}
            isImage={isImage}
            onOpen={() => setActiveAttachment(attachment)}
          />
        ))}
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
