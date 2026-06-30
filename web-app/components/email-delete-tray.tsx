"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Bug,
  Loader2,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type PendingDeletionStatus = "deleting" | "failed";

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

interface EmailDeleteTrayProps {
  items: PendingDeletion[];
  onRetry: (item: PendingDeletion) => void;
  onReportBug: (item: PendingDeletion) => void;
  onDismiss: (id: string) => void;
  /** ids that currently have a bug report in flight */
  reportingIds: Set<string>;
}

export function EmailDeleteTray({
  items,
  onRetry,
  onReportBug,
  onDismiss,
  reportingIds,
}: EmailDeleteTrayProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (items.length === 0) {
    return null;
  }

  const failedCount = items.filter((item) => item.status === "failed").length;
  const deletingCount = items.length - failedCount;
  const hasFailures = failedCount > 0;

  return (
    <div
      className="fixed bottom-6 left-6 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      {isOpen ? (
        <div className="mb-2 w-80 max-w-[calc(100vw-3rem)] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/95 shadow-xl backdrop-blur">
          <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
            <span className="text-xs font-medium text-zinc-300">
              {hasFailures
                ? `${failedCount} delete${failedCount === 1 ? "" : "s"} failed`
                : `Deleting ${deletingCount} email${deletingCount === 1 ? "" : "s"}`}
            </span>
            {deletingCount > 0 ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" />
            ) : null}
          </div>
          <ul className="max-h-72 divide-y divide-zinc-800 overflow-y-auto">
            {items.map((item) => {
              const detail =
                item.status === "failed"
                  ? describeDeletionError(item.error)
                  : null;
              const isReporting = reportingIds.has(item.id);
              return (
                <li key={item.id} className="px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0">
                      {item.status === "failed" ? (
                        <AlertTriangle className="h-4 w-4 text-amber-400" />
                      ) : (
                        <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-zinc-200">
                        {item.sender || "Unknown sender"}
                      </div>
                      <div className="truncate text-xs text-zinc-500">
                        {item.subject || "(no subject)"}
                      </div>
                      {detail ? (
                        <div className="mt-1.5 rounded-md border border-amber-500/20 bg-amber-500/5 px-2 py-1.5">
                          <p className="text-[11px] leading-snug text-amber-200/90">
                            {detail.summary}
                          </p>
                          <p className="mt-0.5 text-[11px] leading-snug text-zinc-500">
                            {detail.hint}
                          </p>
                          <div className="mt-1.5 flex items-center gap-1.5">
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
                            <button
                              type="button"
                              onClick={() => onDismiss(item.id)}
                              className="ml-auto inline-flex items-center rounded-md p-1 text-zinc-500 transition-colors hover:text-zinc-300"
                              aria-label="Dismiss"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className={cn(
          "relative flex h-11 w-11 items-center justify-center rounded-full border shadow-lg transition-colors",
          hasFailures
            ? "border-amber-500/40 bg-amber-950/40 text-amber-300 hover:bg-amber-900/40"
            : "border-zinc-700 bg-zinc-900/90 text-zinc-300 hover:bg-zinc-800",
        )}
        aria-label={
          hasFailures
            ? `${failedCount} email delete${failedCount === 1 ? "" : "s"} failed`
            : `Deleting ${deletingCount} email${deletingCount === 1 ? "" : "s"}`
        }
      >
        <Trash2 className="h-5 w-5" />
        {deletingCount > 0 ? (
          <Loader2 className="absolute -right-1 -top-1 h-4 w-4 animate-spin rounded-full bg-zinc-950 text-[rgb(var(--theme-primary-rgb))]" />
        ) : null}
        {hasFailures ? (
          <AlertTriangle className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-zinc-950 text-amber-400" />
        ) : null}
        <span
          className={cn(
            "absolute -bottom-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white",
            hasFailures ? "bg-amber-500" : "bg-[rgb(var(--theme-primary-rgb))]",
          )}
        >
          {items.length}
        </span>
      </button>
    </div>
  );
}
