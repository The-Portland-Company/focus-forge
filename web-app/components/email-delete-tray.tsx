"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bug,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type PendingDeletionStatus = "deleting" | "succeeded" | "failed";

export interface PendingDeletion {
  /** Stable key for this pending delete (threadId + action). */
  id: string;
  threadId: string;
  action: string;
  sender: string;
  subject: string;
  status: PendingDeletionStatus;
  /** Raw server/network error message (only when status === "failed"). */
  error?: string;
}

/** Matches the .animate-slide-down-out duration in globals.css. */
const TOAST_EXIT_MS = 250;
/** How long a successful delete stays on screen before sliding away. */
export const DELETE_SUCCESS_VISIBLE_MS = 3000;

/**
 * Maps a raw error message to a plain-language explanation plus a short hint
 * about what the user can do next. Falls back to the raw message so we never
 * hide the underlying cause.
 */
export function describeDeletionError(error?: string): {
  summary: string;
  hint: string;
} {
  const raw = (error || "").trim();
  const lower = raw.toLowerCase();

  if (!raw) {
    return {
      summary: "The delete didn't go through, but no reason was reported.",
      hint: "Try again, or report this so we can dig in.",
    };
  }

  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed") ||
    lower.includes("load failed")
  ) {
    return {
      summary: "Couldn't reach the server — this looks like a network issue.",
      hint: "Check your connection and retry.",
    };
  }

  if (lower.includes("unauthorized") || lower.includes("401")) {
    return {
      summary: "Your session expired, so the delete wasn't authorized.",
      hint: "Refresh the page to sign back in, then retry.",
    };
  }

  if (lower.includes("forbidden") || lower.includes("403")) {
    return {
      summary: "You don't have permission to delete this email.",
      hint: "If this is unexpected, report it.",
    };
  }

  if (lower.includes("not found") || lower.includes("404")) {
    return {
      summary: "The email couldn't be found on the server.",
      hint: "It may already be gone. Refresh to confirm.",
    };
  }

  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("504")
  ) {
    return {
      summary: "The server took too long to respond.",
      hint: "Retry in a moment.",
    };
  }

  if (
    lower.includes("500") ||
    lower.includes("internal server") ||
    lower.includes("502") ||
    lower.includes("503")
  ) {
    return {
      summary: "The server hit an error while deleting this email.",
      hint: "Retry, or report it if it keeps happening.",
    };
  }

  return {
    summary: raw,
    hint: "Retry, or report this if it persists.",
  };
}

/** Headline copy per state — "{verb} {Subject} from {Who}". */
export function describeDeletionHeadline(item: PendingDeletion): string {
  const subject = item.subject || "(no subject)";
  const sender = item.sender || "Unknown sender";
  if (item.status === "succeeded") return `Deleted ${subject} from ${sender}`;
  if (item.status === "failed")
    return `Couldn't delete ${subject} from ${sender}`;
  return `Deleting ${subject} from ${sender}`;
}

interface EmailDeleteTrayProps {
  items: PendingDeletion[];
  onRetry: (item: PendingDeletion) => void;
  onReportBug: (item: PendingDeletion) => void;
  onDismiss: (id: string) => void;
  /** Scroll to + flash the email a failed delete belongs to. */
  onLocate?: (item: PendingDeletion) => void;
  /** ids that currently have a bug report in flight */
  reportingIds: Set<string>;
}

function DeletionToast({
  item,
  onRetry,
  onReportBug,
  onDismiss,
  onLocate,
  isReporting,
}: {
  item: PendingDeletion;
  onRetry: (item: PendingDeletion) => void;
  onReportBug: (item: PendingDeletion) => void;
  onDismiss: (id: string) => void;
  onLocate?: (item: PendingDeletion) => void;
  isReporting: boolean;
}) {
  const [isLeaving, setIsLeaving] = useState(false);

  // Play the slide-down/fade-out before unmounting. Removing on the timer
  // directly would yank the card out of the DOM mid-animation so it would
  // vanish rather than slide away.
  const requestClose = useCallback(() => {
    setIsLeaving((already) => {
      if (already) return already;
      window.setTimeout(() => onDismiss(item.id), TOAST_EXIT_MS);
      return true;
    });
  }, [item.id, onDismiss]);

  // Success auto-dismisses after 3s. "deleting" and "failed" persist: the first
  // is still running, the second needs a decision from the user.
  useEffect(() => {
    if (item.status !== "succeeded") return;
    const timer = window.setTimeout(requestClose, DELETE_SUCCESS_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [item.status, requestClose]);

  const detail = item.status === "failed" ? describeDeletionError(item.error) : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3 py-2.5 shadow-xl backdrop-blur",
        item.status === "succeeded"
          ? "border-emerald-500/30 bg-emerald-950/80"
          : item.status === "failed"
            ? "border-rose-500/40 bg-rose-950/80"
            : "border-zinc-700/70 bg-zinc-950/90",
        isLeaving ? "animate-slide-down-out" : "animate-slide-up-in",
      )}
    >
      <span className="mt-0.5 shrink-0">
        {item.status === "succeeded" ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        ) : item.status === "failed" ? (
          <Trash2 className="h-4 w-4 text-rose-400" />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-xs font-medium",
            item.status === "succeeded"
              ? "text-emerald-200"
              : item.status === "failed"
                ? "text-rose-200"
                : "text-zinc-200",
          )}
        >
          {describeDeletionHeadline(item)}
        </p>

        {detail ? (
          <>
            <p className="mt-1 text-[11px] leading-snug text-rose-200/85">
              {detail.summary}
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-zinc-400">
              {detail.hint}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {onLocate ? (
                <button
                  type="button"
                  onClick={() => onLocate(item)}
                  className="rounded-md text-[11px] font-medium text-rose-200 underline decoration-rose-400/60 underline-offset-4 transition-colors hover:text-white"
                >
                  Show the email
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onRetry(item)}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-800"
              >
                <RotateCcw className="h-3 w-3" />
                Retry
              </button>
              <button
                type="button"
                disabled={isReporting}
                onClick={() => onReportBug(item)}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-800 disabled:opacity-50"
              >
                {isReporting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Bug className="h-3 w-3" />
                )}
                Report bug
              </button>
            </div>
          </>
        ) : null}
      </div>

      <button
        type="button"
        onClick={requestClose}
        aria-label="Dismiss"
        title="Dismiss"
        className="-mr-0.5 shrink-0 rounded-md p-1 text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * Bottom-centre alert stack for email deletions.
 *
 * One card per delete, listed in the order the user triggered them, so a rapid
 * burst of deletes reads as a queue rather than a single collapsed counter.
 * Cards fade in and slide up, then (on success) slide down and fade out after
 * 3s; every card can be dismissed manually.
 */
export function EmailDeleteTray({
  items,
  onRetry,
  onReportBug,
  onDismiss,
  onLocate,
  reportingIds,
}: EmailDeleteTrayProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[70] flex w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 flex-col justify-end gap-2">
      {items.map((item) => (
        <DeletionToast
          key={item.id}
          item={item}
          onRetry={onRetry}
          onReportBug={onReportBug}
          onDismiss={onDismiss}
          onLocate={onLocate}
          isReporting={reportingIds.has(item.id)}
        />
      ))}
    </div>
  );
}
