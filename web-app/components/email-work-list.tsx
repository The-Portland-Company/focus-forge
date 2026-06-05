"use client";

import * as Popover from "@radix-ui/react-popover";
import { useRef, useState, type CSSProperties } from "react";
import {
  Check,
  ChevronDown,
  Clock,
  FolderSearch,
  Loader2,
  Mail,
  MessageSquare,
  Plus,
  Search,
  Skull,
  Sparkles,
  SquareCheckBig,
  Text,
  Trash2,
  Wand2,
} from "lucide-react";
import { SnoozePopover } from "@/components/snooze-popover";
import { Tooltip } from "@/components/tooltip";
import { EmailHtmlContent } from "@/components/ui/email-html-content";
import { stripQuotedAndSignature } from "@/lib/email-inbox/strip-quoted";
import { formatEmailTimestamp } from "@/lib/email-inbox/format-timestamp";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  ConversationEntry,
  InboxItem,
  InboxParticipant,
  Mailbox,
  Project,
} from "@/lib/types";
import type { ThreadAction } from "@/lib/email-inbox/thread-actions";
import { cn } from "@/lib/utils";

type LinkedTaskSummary = {
  id: string;
  name: string;
};

type EmailWorkListProps = {
  items: InboxItem[];
  mailboxes: Mailbox[];
  projects: Project[];
  selectedId?: string | null;
  freshlyUpdatedIds?: Set<string>; // ids new/changed via background refetch (green flash)
  alwaysShowSummary?: boolean;
  alwaysShowExcerpt?: boolean;
  onSelect?: (item: InboxItem) => void;
  onSenderClick?: (sender: { name: string; email: string }) => void;
  onProjectClick?: (item: InboxItem) => void;
  activeProjectPickerThreadId?: string | null;
  projectSearchQuery?: string;
  filteredProjects?: Project[];
  isProjectActionBusy?: boolean;
  isCreatingProject?: boolean;
  onProjectSearchQueryChange?: (value: string) => void;
  onProjectPickerSelect?: (item: InboxItem, projectId: string) => void;
  onProjectCreate?: (item: InboxItem) => void;
  onProjectPickerClose?: () => void;
  onThreadAction?: (
    item: InboxItem,
    action: ThreadAction,
    options?: { snoozedUntil?: string },
  ) => Promise<void> | void;
  showTodayTriageActions?: boolean;
  emptyLabel?: string;
};

/** Thread timestamp shown on inbox rows, e.g. "Jan. 1st, 2026 2:01 PM".
 *  Delegates to the shared {@link formatEmailTimestamp} so every email view
 *  renders dates identically. */
export function formatThreadTimestamp(iso?: string | null): string {
  return formatEmailTimestamp(iso);
}

export function formatEmailSubject(subject: string) {
  return subject.trim() || "Untitled email";
}

export function shouldShowSecondaryActionTitle(
  actionTitle: string | null | undefined,
  subject: string,
) {
  const normalizedActionTitle = actionTitle?.trim();

  if (!normalizedActionTitle) {
    return false;
  }

  const lowerActionTitle = normalizedActionTitle.toLocaleLowerCase();

  if (
    lowerActionTitle.startsWith("reply and handle:") ||
    lowerActionTitle.startsWith("review and handle:") ||
    lowerActionTitle.startsWith("handle:")
  ) {
    return false;
  }

  return (
    lowerActionTitle !== formatEmailSubject(subject).toLocaleLowerCase()
  );
}

export function formatParticipantValue(participant: InboxParticipant) {
  const displayName = participant.displayName?.trim();
  const emailAddress = participant.emailAddress.trim();

  if (displayName && displayName !== emailAddress) {
    return emailAddress ? `${displayName} <${emailAddress}>` : displayName;
  }

  return emailAddress || displayName || "";
}

export function getPrimarySenderParticipant(
  participants: InboxParticipant[] | undefined,
) {
  return (
    (participants || []).find(
      (participant) => participant.participantRole === "from",
    ) || null
  );
}

export function formatParticipantName(participant: InboxParticipant | null) {
  if (!participant) return "Unknown sender";

  const displayName = participant.displayName?.trim();
  const emailAddress = participant.emailAddress.trim();

  if (displayName && displayName !== emailAddress) {
    return displayName;
  }

  // Fall back to the email address before any generic label so the inbox
  // never shows "Unknown" when we actually know who sent the message.
  return emailAddress || "Unknown sender";
}

export function formatParticipantLine(
  participants: InboxParticipant[] | undefined,
  role: "from" | "cc",
) {
  const participantNames = Array.from(
    new Set(
      (participants || [])
        .filter((participant) => participant.participantRole === role)
        .map((participant) => formatParticipantValue(participant))
        .filter(Boolean),
    ),
  );

  const label = role === "from" ? "From" : "CC";
  const fallback = role === "from" ? "Unknown sender" : null;

  if (participantNames.length === 0) {
    return fallback ? `${label}: ${fallback}` : null;
  }

  return `${label}: ${participantNames.join(", ")}`;
}

export function getMailboxDisplayLabel(
  mailbox: Mailbox | null | undefined,
  item: Pick<InboxItem, "mailboxName" | "mailboxEmailAddress">,
) {
  const label = [
    mailbox?.displayName,
    mailbox?.name,
    item.mailboxName,
    mailbox?.emailAddress,
    item.mailboxEmailAddress,
  ].find((value) => value?.trim());

  return label?.trim() || "Mailbox";
}

export function getMailboxAccentColor(
  mailbox: Mailbox | null | undefined,
  item: Pick<InboxItem, "mailboxId" | "mailboxName" | "mailboxEmailAddress">,
) {
  const seed =
    mailbox?.id ||
    mailbox?.emailAddress ||
    item.mailboxId ||
    item.mailboxEmailAddress ||
    item.mailboxName ||
    "mailbox";

  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  const hue = hash % 360;
  return `hsl(${hue} 72% 64%)`;
}

export function getMailboxBadgeLabel(label: string) {
  const words = label.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return "MB";
  }

  if (words.length === 1) {
    const [firstWord] = words;
    const compact = firstWord.replace(/[^a-z0-9]/gi, "");
    return (compact.slice(0, 2) || "MB").toUpperCase();
  }

  return words
    .slice(0, 2)
    .map((word) => word.replace(/[^a-z0-9]/gi, "").charAt(0).toUpperCase())
    .join("");
}

export function getProjectBadgeLabel(project: Pick<Project, "name"> | null) {
  if (!project?.name?.trim()) {
    return null;
  }

  const words = project.name.trim().split(/\s+/).filter(Boolean);

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

export function getInboxReviewState(
  item:
    | Pick<InboxItem, "status" | "classification">
    | null
    | undefined,
) {
  if (!item) {
    return null;
  }

  if (item.status === "quarantine") {
    return "quarantine";
  }

  if (item.status === "spam" || item.classification === "spam") {
    return "spam";
  }

  return null;
}

export function shouldShowStatusBadge(
  item:
    | Pick<InboxItem, "status" | "classification">
    | null
    | undefined,
) {
  return getInboxReviewState(item) !== null;
}

export function shouldShowSpamIndicator(
  item:
    | Pick<InboxItem, "status" | "classification">
    | null
    | undefined,
) {
  return getInboxReviewState(item) !== null;
}

export function getInboxReviewBadgeLabel(
  item:
    | Pick<InboxItem, "status" | "classification">
    | null
    | undefined,
) {
  const reviewState = getInboxReviewState(item);

  if (reviewState === "quarantine") {
    return "Quarantine";
  }

  // Spam-classified threads still sitting in the Inbox are "flagged" —
  // they only read "Quarantine" once actually moved to that folder.
  if (reviewState === "spam") {
    return "Flagged";
  }

  return null;
}

export function getEmailReadStateLabel(isUnread?: boolean) {
  return isUnread ? "Unread" : "Read";
}

export function getEmailReadStateBadgeClassName(isUnread?: boolean) {
  return isUnread
    ? "rounded-full border border-[rgb(var(--theme-primary-rgb))]/45 bg-[rgb(var(--theme-primary-rgb))]/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[rgb(var(--theme-primary-rgb))]"
    : "rounded-full border border-zinc-700 bg-zinc-900/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400";
}

export function formatInboxPreviewText(
  value: string | null | undefined,
  maxLength = 200,
) {
  if (!value) return "No summary available yet.";

  // Convert block-level HTML to newlines (not spaces) so the quoted/signature
  // stripper can detect line-based markers, then drop quoted prior threads and
  // signatures before flattening to a single-line preview.
  const asText = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<blockquote[^>]*>/gi, "\n>")
    .replace(/<[^>]+>/g, " ");

  const withoutHtml = stripQuotedAndSignature(asText);

  const withoutMarkdown = withoutHtml
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*_>#~-]+/g, " ");

  const flattened = withoutMarkdown.replace(/\s+/g, " ").trim();

  if (!flattened) return "No summary available yet.";
  if (flattened.length <= maxLength) return flattened;

  return `${flattened.slice(0, maxLength).trimEnd()}...`;
}

export function shouldShowAiSummary(params: {
  summaryText: string | null | undefined;
  previewText: string | null | undefined;
  forceShow?: boolean;
}) {
  const normalizedSummary = params.summaryText?.trim();

  if (!normalizedSummary) {
    return false;
  }

  const lowerSummary = normalizedSummary.toLocaleLowerCase();

  if (
    lowerSummary === "no summary available yet." ||
    normalizedSummary.length < 28
  ) {
    return false;
  }

  if (params.forceShow) {
    return true;
  }

  const normalizedPreview = params.previewText?.trim();

  if (!normalizedPreview) {
    return true;
  }

  const lowerPreview = normalizedPreview.toLocaleLowerCase();

  if (
    lowerSummary === lowerPreview ||
    lowerPreview.includes(lowerSummary) ||
    lowerSummary.includes(lowerPreview)
  ) {
    return false;
  }

  return true;
}

export function getEmailWorkItemClassName(params: {
  isSelected: boolean;
  isUnread?: boolean;
}) {
  return cn(
    "w-full min-w-0 rounded-xl border px-4 py-3 text-left transition-[background-color,background-image,border-color] duration-200",
    params.isSelected
      ? "border-zinc-600/80 shadow-none"
      : "border-zinc-800/80 shadow-none",
  );
}

export function getEmailWorkItemStyle(params: {
  isSelected: boolean;
  isUnread?: boolean;
}): CSSProperties {
  if (params.isSelected) {
    return {
      backgroundColor: "rgba(255, 255, 255, 0.12)",
    };
  }

  if (params.isUnread) {
    return {
      backgroundImage:
        "linear-gradient(rgba(10, 10, 11, 0.9), rgba(10, 10, 11, 0.9)), var(--user-profile-gradient)",
    };
  }

  return {
    backgroundColor: params.isSelected
      ? "rgba(255, 255, 255, 0.12)"
      : "rgba(255, 255, 255, 0.10)",
  };
}

export function getEmailWorkPreviewClassName(isUnread?: boolean) {
  return cn(
    "mt-3 break-words whitespace-normal text-sm",
    isUnread ? "font-semibold text-zinc-100" : "font-normal text-zinc-400",
  );
}

export function getEmailWorkVisualUnreadState(params: {
  isSelected: boolean;
  isUnread?: boolean;
}) {
  return Boolean(params.isUnread) && !params.isSelected;
}

export async function parseLinkedTasksResponse(response: Response) {
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "Failed to load linked tasks";

    throw new Error(message);
  }

  if (!Array.isArray(payload)) {
    return [];
  }

  return payload.filter(
    (task): task is LinkedTaskSummary =>
      Boolean(
        task &&
          typeof task === "object" &&
          "id" in task &&
          typeof task.id === "string" &&
          "name" in task &&
          typeof task.name === "string",
      ),
  );
}

export function EmailWorkList({
  items,
  mailboxes,
  projects,
  selectedId,
  freshlyUpdatedIds,
  alwaysShowSummary = false,
  alwaysShowExcerpt = false,
  onSelect,
  onSenderClick,
  onProjectClick,
  activeProjectPickerThreadId = null,
  projectSearchQuery = "",
  filteredProjects = [],
  isProjectActionBusy = false,
  isCreatingProject = false,
  onProjectSearchQueryChange,
  onProjectPickerSelect,
  onProjectCreate,
  onProjectPickerClose,
  onThreadAction,
  showTodayTriageActions = false,
  emptyLabel = "No email work yet.",
}: EmailWorkListProps) {
  const [linkedTasksThreadTitle, setLinkedTasksThreadTitle] = useState("");
  const [linkedTasks, setLinkedTasks] = useState<LinkedTaskSummary[]>([]);
  const [isLinkedTasksModalOpen, setIsLinkedTasksModalOpen] = useState(false);
  const [linkedTasksLoading, setLinkedTasksLoading] = useState(false);
  const [linkedTasksError, setLinkedTasksError] = useState<string | null>(null);
  const [spamActionThreadId, setSpamActionThreadId] = useState<string | null>(
    null,
  );
  // Task C: rendered hover popover showing a mini preview of the actual email
  // message — real HTML (images, formatting, links) reused from the same safe
  // renderer used in the thread modal. The inbox payload only carries
  // `previewText`, so the full HTML body is lazy-fetched per thread on hover
  // (via the same /api/email/threads/{id} endpoint the modal uses) and cached.
  const [hoverPreview, setHoverPreview] = useState<{
    threadId: string;
    fallbackText: string;
    top: number;
    left: number;
  } | null>(null);
  // Cache of fetched bodies keyed by thread id. Value is the sanitized-ready
  // HTML (or null if the thread had no HTML body), `loading`, or `error`.
  const bodyCacheRef = useRef<
    Map<string, { html: string | null } | "loading" | "error">
  >(new Map());
  // Bump to force a re-render when an async fetch resolves (refs don't trigger).
  const [, setBodyCacheVersion] = useState(0);

  const ensureThreadBody = (threadId: string) => {
    const cache = bodyCacheRef.current;
    const existing = cache.get(threadId);
    if (existing !== undefined) return;

    cache.set(threadId, "loading");
    setBodyCacheVersion((value) => value + 1);

    void (async () => {
      try {
        const response = await fetch(`/api/email/threads/${threadId}`, {
          credentials: "include",
        });
        if (!response.ok) throw new Error("Failed to load message");
        const payload = (await response.json()) as {
          conversation?: ConversationEntry[];
        };
        const conversation = payload.conversation ?? [];
        // Prefer the most recent entry that actually carries HTML; fall back to
        // the first entry. This mirrors the thread modal's "primary" message.
        const withHtml = [...conversation]
          .reverse()
          .find((entry) => entry.contentHtml?.trim());
        const html = withHtml?.contentHtml?.trim() || null;
        cache.set(threadId, { html });
      } catch {
        cache.set(threadId, "error");
      } finally {
        setBodyCacheVersion((value) => value + 1);
      }
    })();
  };
  // Task E: AI task-generation modal state.
  const [taskGenItem, setTaskGenItem] = useState<InboxItem | null>(null);
  const [taskGenPhase, setTaskGenPhase] = useState<
    "running" | "done" | "existing" | "error"
  >("running");
  const [taskGenResults, setTaskGenResults] = useState<LinkedTaskSummary[]>([]);
  const [taskGenError, setTaskGenError] = useState<string | null>(null);

  const handleOpenTaskGenerator = async (item: InboxItem) => {
    setTaskGenItem(item);
    setTaskGenResults([]);
    setTaskGenError(null);

    // Already has linked tasks (or the action already ran) → show them.
    if (item.derivedTaskCount > 0) {
      setTaskGenPhase("existing");
      try {
        const response = await fetch(`/api/email/threads/${item.id}/tasks`, {
          credentials: "include",
        });
        setTaskGenResults(await parseLinkedTasksResponse(response));
      } catch (error) {
        setTaskGenError(
          error instanceof Error
            ? error.message
            : "Failed to load linked tasks",
        );
      }
      return;
    }

    // Otherwise generate tasks from this email via AI.
    setTaskGenPhase("running");
    try {
      const response = await fetch(`/api/email/threads/${item.id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ projectId: item.projectId ?? null }),
      });
      const created = await parseLinkedTasksResponse(response);
      setTaskGenResults(created);
      setTaskGenPhase("done");
    } catch (error) {
      setTaskGenError(
        error instanceof Error ? error.message : "Failed to generate tasks",
      );
      setTaskGenPhase("error");
    }
  };

  const closeTaskGenerator = () => {
    setTaskGenItem(null);
    setTaskGenResults([]);
    setTaskGenError(null);
    setTaskGenPhase("running");
  };

  const handleOpenLinkedTasks = async (item: InboxItem) => {
    setLinkedTasksThreadTitle(formatEmailSubject(item.subject));
    setLinkedTasks([]);
    setLinkedTasksError(null);
    setLinkedTasksLoading(true);
    setIsLinkedTasksModalOpen(true);

    try {
      const response = await fetch(`/api/email/threads/${item.id}/tasks`, {
        credentials: "include",
      });
      const payload = await parseLinkedTasksResponse(response);
      setLinkedTasks(payload);
    } catch (error) {
      setLinkedTasksError(
        error instanceof Error ? error.message : "Failed to load linked tasks",
      );
    } finally {
      setLinkedTasksLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-6 text-sm text-zinc-500">
        {emptyLabel}
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {items.map((item) => {
        const isSelected = selectedId === item.id;
        const isVisuallyUnread = getEmailWorkVisualUnreadState({
          isSelected,
          isUnread: item.isUnread,
        });
        const mailbox = mailboxes.find(
          (candidate) => candidate.id === item.mailboxId,
        );
        const mailboxLabel = getMailboxDisplayLabel(mailbox, item);
        const mailboxAccentColor = getMailboxAccentColor(mailbox, item);
        const project = projects.find(
          (candidate) => candidate.id === item.projectId,
        );
        const isProjectPickerOpen = activeProjectPickerThreadId === item.id;
        const sender = getPrimarySenderParticipant(item.participants);
        const senderName = formatParticipantName(sender);
        const ccLine = formatParticipantLine(item.participants, "cc");
        const rawSummaryText = item.summaryText
          ? formatInboxPreviewText(item.summaryText)
          : null;
        // The AI title (rendered above) replaces the inline AI summary.
        // Cleaned email body excerpt used for the hover tooltip.
        const previewText = item.previewText
          ? formatInboxPreviewText(item.previewText)
          : rawSummaryText || "No summary available yet.";
        const hasAiTitle = Boolean(item.actionTitle?.trim());
        const aiTitle = hasAiTitle
          ? (item.actionTitle as string).trim()
          : formatEmailSubject(item.subject);
        const reviewState = getInboxReviewState(item);
        const reviewBadgeLabel = getInboxReviewBadgeLabel(item);
        const canMoveToQuarantine =
          reviewState === "spam" && item.status !== "quarantine";

        return (
          <div
            key={item.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect?.(item)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect?.(item);
              }
            }}
            className={cn(
              getEmailWorkItemClassName({
                isSelected,
                isUnread: isVisuallyUnread,
              }),
              freshlyUpdatedIds?.has(item.id) && !isSelected
                ? "fresh-data-highlight"
                : "",
            )}
            style={getEmailWorkItemStyle({
              isSelected,
              isUnread: isVisuallyUnread,
            })}
          >
            <div
              className={cn(
                "group flex min-w-0 flex-col transition-opacity",
                isVisuallyUnread
                  ? "font-semibold opacity-100"
                  : "font-normal opacity-85",
              )}
            >
              <div
                className={cn(
                  "flex min-w-0 items-start justify-between gap-3",
                  isVisuallyUnread ? "opacity-100" : "opacity-100",
                )}
              >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                  {sender ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-xs",
                        isVisuallyUnread ? "text-zinc-300" : "text-zinc-500",
                      )}
                    >
                      <span>From:</span>
                      <Tooltip
                        content={sender.emailAddress?.trim() || senderName}
                        className="w-auto"
                        side="top"
                      >
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onSenderClick?.({
                              name: senderName,
                              email: sender.emailAddress,
                            });
                          }}
                          className="max-w-[220px] truncate cursor-pointer text-xs text-zinc-400 underline decoration-zinc-700 underline-offset-4 transition-colors hover:text-zinc-200 sm:max-w-[280px]"
                        >
                          {senderName}
                        </button>
                      </Tooltip>
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "break-words text-xs",
                        isVisuallyUnread ? "text-zinc-300" : "text-zinc-500",
                      )}
                    >
                      From: Unknown sender
                    </span>
                  )}
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 break-words text-xs",
                      isVisuallyUnread ? "text-zinc-300" : "text-zinc-500",
                    )}
                  >
                    <span>To:</span>
                    {(mailbox?.emailAddress || item.mailboxEmailAddress) ? (
                      <Tooltip
                        content={mailbox?.emailAddress || item.mailboxEmailAddress || ""}
                        className="w-auto"
                        side="top"
                      >
                        <span
                          className="font-medium cursor-help"
                          style={{ color: mailboxAccentColor }}
                        >
                          {mailboxLabel}
                        </span>
                      </Tooltip>
                    ) : (
                      <span
                        className="font-medium"
                        style={{ color: mailboxAccentColor }}
                      >
                        {mailboxLabel}
                      </span>
                    )}
                  </span>
                  {ccLine ? (
                    <span
                      className={cn(
                        "break-words text-xs",
                        isVisuallyUnread ? "text-zinc-300" : "text-zinc-500",
                      )}
                    >
                      {ccLine}
                    </span>
                  ) : null}
                  {/* Thread timestamp, pushed to the right side of the From/To row */}
                  {(() => {
                    const ts = formatThreadTimestamp(
                      item.latestMessageAt ||
                        item.latestInboundAt ||
                        item.latestOutboundAt ||
                        item.updatedAt ||
                        item.createdAt,
                    );
                    return ts ? (
                      <span
                        className={cn(
                          "ml-auto whitespace-nowrap text-[11px] tabular-nums",
                          isVisuallyUnread ? "text-zinc-300" : "text-zinc-500",
                        )}
                        title={
                          (item.latestMessageAt ||
                            item.latestInboundAt ||
                            item.latestOutboundAt ||
                            item.updatedAt ||
                            item.createdAt) ?? undefined
                        }
                      >
                        {ts}
                      </span>
                    ) : null;
                  })()}
                </div>
                <div className="mt-1 flex min-w-0 items-start gap-2">
                  {shouldShowSpamIndicator(item) && reviewState !== "quarantine" ? (
                    canMoveToQuarantine ? (
                      <Popover.Root
                        open={spamActionThreadId === item.id}
                        onOpenChange={(open) =>
                          setSpamActionThreadId(open ? item.id : null)
                        }
                      >
                        <Popover.Trigger asChild>
                          <button
                            type="button"
                            onClick={(event) => event.stopPropagation()}
                            className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-rose-400 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
                            aria-label="Spam actions"
                            title="Spam actions"
                          >
                            <Skull className="h-4 w-4" />
                          </button>
                        </Popover.Trigger>
                        <Popover.Portal>
                          <Popover.Content
                            side="bottom"
                            align="start"
                            sideOffset={8}
                            onInteractOutside={() => setSpamActionThreadId(null)}
                            className="z-50 w-56 rounded-xl border border-zinc-700 bg-zinc-950/95 p-2 shadow-2xl backdrop-blur"
                          >
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSpamActionThreadId(null);
                                void onThreadAction?.(item, "quarantine");
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-zinc-800 hover:text-white"
                            >
                              <Skull className="h-4 w-4 text-rose-400" />
                              Move to Quarantine
                            </button>
                          </Popover.Content>
                        </Popover.Portal>
                      </Popover.Root>
                    ) : (
                      <Tooltip
                        content={reviewBadgeLabel || "Spam"}
                        className="w-auto"
                        side="top"
                      >
                        <span className="inline-flex">
                          <Skull className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                        </span>
                      </Tooltip>
                    )
                  ) : null}
                  <div className="min-w-0">
                    <div
                      className={cn(
                        "flex min-w-0 items-center gap-1.5 leading-5 break-words text-white",
                        isVisuallyUnread ? "font-semibold" : "font-medium",
                      )}
                    >
                      <Tooltip
                        content={`Original Subject: ${
                          item.subject?.trim() || "(no subject)"
                        }`}
                        className="w-auto"
                        side="right"
                      >
                        <span className="inline-flex shrink-0 cursor-help items-center">
                          <Text className="h-3.5 w-3.5 text-zinc-400" />
                        </span>
                      </Tooltip>
                      <Sparkles className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                      <span
                        className="min-w-0 break-words"
                        onMouseEnter={(event) => {
                          const rect =
                            event.currentTarget.getBoundingClientRect();
                          // Clamp horizontally so a wide card near the right
                          // edge shifts left instead of overflowing the viewport.
                          const cardWidth = Math.min(512, window.innerWidth - 24);
                          const left = Math.max(
                            12,
                            Math.min(
                              rect.left,
                              window.innerWidth - cardWidth - 12,
                            ),
                          );
                          setHoverPreview({
                            threadId: item.id,
                            fallbackText: previewText,
                            top: rect.bottom + 8,
                            left,
                          });
                          ensureThreadBody(item.id);
                        }}
                        onMouseLeave={() => setHoverPreview(null)}
                      >
                        {aiTitle}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {/* Quarantine threads keep a distinct text badge; the SPAM /
                    "Flagged" text label is removed because the left-aligned
                    skull icon already signals spam-classified rows. */}
                {shouldShowStatusBadge(item) &&
                reviewBadgeLabel &&
                reviewState === "quarantine" ? (
                  <div className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-rose-300">
                    {reviewBadgeLabel}
                  </div>
                ) : null}
                {showTodayTriageActions ? (
                  <div
                    className="flex items-center gap-1"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Tooltip
                      content={
                        item.derivedTaskCount > 0
                          ? "View linked tasks"
                          : "Create tasks from email"
                      }
                      className="w-auto"
                      side="top"
                    >
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleOpenTaskGenerator(item);
                        }}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-emerald-300"
                        aria-label={
                          item.derivedTaskCount > 0
                            ? "View linked tasks"
                            : "Create tasks from email"
                        }
                      >
                        <Wand2 className="h-3.5 w-3.5" />
                      </button>
                    </Tooltip>
                    <SnoozePopover
                      onSelect={(iso) =>
                        onThreadAction?.(item, "snooze", { snoozedUntil: iso })
                      }
                      trigger={
                        <button
                          type="button"
                          onClick={(event) => event.stopPropagation()}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-sky-300"
                          aria-label="Snooze email"
                          title="Snooze"
                        >
                          <Clock className="h-3.5 w-3.5" />
                        </button>
                      }
                    />
                    <Tooltip
                      content="Delete email"
                      className="w-auto"
                      side="top"
                    >
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void onThreadAction?.(item, "delete");
                        }}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-rose-300"
                        aria-label="Delete email"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </Tooltip>
                  </div>
                ) : null}
              </div>
              </div>

              <div
                className={cn(
                  "mt-2 flex min-w-0 flex-wrap items-center gap-3 text-xs text-zinc-500 transition-opacity",
                  isVisuallyUnread ? "text-zinc-400 opacity-100" : "opacity-100",
                )}
              >
                <span className="inline-flex items-center gap-1 break-words">
                  <Mail className="h-3.5 w-3.5" />
                  {mailboxLabel}
                </span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onProjectClick?.(item);
                  }}
                  className="inline-flex items-center gap-1 break-words rounded-md px-1 py-0.5 text-left transition-colors hover:bg-zinc-800/70 hover:text-white"
                >
                  {project ? (
                    <>
                      <span
                        className="inline-flex h-4 min-w-4 items-center justify-center rounded-[4px] px-1 text-[9px] font-semibold uppercase tracking-wide text-black"
                        style={{ backgroundColor: project.color }}
                      >
                        {getProjectBadgeLabel(project)}
                      </span>
                      {project.name}
                    </>
                  ) : (
                    <>
                      <FolderSearch className="h-3.5 w-3.5" />
                      <span className="text-zinc-500">No Project</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleOpenLinkedTasks(item);
                  }}
                  disabled={item.derivedTaskCount === 0}
                  className={cn(
                    "inline-flex items-center gap-1 break-words rounded-md px-1 py-0.5 text-left transition-colors",
                    item.derivedTaskCount > 0
                      ? "hover:bg-zinc-800/70 hover:text-white"
                      : "cursor-default opacity-70",
                  )}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  {item.derivedTaskCount} linked task
                  {item.derivedTaskCount === 1 ? "" : "s"}
                </button>
                {item.actionConfidence ? (
                  <span className="inline-flex items-center gap-1 break-words">
                    <Sparkles className="h-3.5 w-3.5" />
                    {Math.round(item.actionConfidence * 100)}% confidence
                  </span>
                ) : null}
              </div>

              {isProjectPickerOpen ? (
                <div
                  className="relative mt-3"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <div className="rounded-xl border border-zinc-700 bg-zinc-900/95 p-3 shadow-2xl">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                      <input
                        type="text"
                        value={projectSearchQuery}
                        onChange={(event) =>
                          onProjectSearchQueryChange?.(event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.preventDefault();
                            onProjectPickerClose?.();
                            return;
                          }

                          if (
                            event.key === "Enter" &&
                            filteredProjects.length > 0
                          ) {
                            event.preventDefault();
                            onProjectPickerSelect?.(item, filteredProjects[0].id);
                          }
                        }}
                        placeholder="Search projects..."
                        autoFocus
                        disabled={isProjectActionBusy || isCreatingProject}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 py-2.5 pl-10 pr-10 text-sm text-white transition-colors placeholder:text-zinc-500 focus:outline-none focus:ring-2 ring-theme disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={() => onProjectPickerClose?.()}
                        className="absolute inset-y-0 right-3 inline-flex items-center text-zinc-500 transition-colors hover:text-zinc-300"
                        aria-label="Close project picker"
                      >
                        {isProjectActionBusy || isCreatingProject ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ChevronDown className="h-4 w-4 rotate-180" />
                        )}
                      </button>
                    </div>

                    <div className="mt-2 rounded-lg border border-zinc-700 bg-zinc-950/70">
                      <div className="border-b border-zinc-700/80 px-3 py-2">
                        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
                          Current Project
                        </div>
                        <div className="mt-2 inline-flex max-w-full items-center gap-2 rounded-full border border-zinc-700/80 bg-zinc-950/80 px-3 py-1 text-xs text-zinc-300">
                          {project ? (
                            <>
                              <span
                                className="inline-flex h-4 min-w-4 items-center justify-center rounded-[4px] px-1 text-[9px] font-semibold uppercase tracking-wide text-black"
                                style={{ backgroundColor: project.color }}
                              >
                                {getProjectBadgeLabel(project)}
                              </span>
                              <span className="truncate">{project.name}</span>
                            </>
                          ) : (
                            <span className="truncate">No Project</span>
                          )}
                        </div>
                      </div>

                      {filteredProjects.length > 0 ? (
                        filteredProjects.map((candidate) => {
                          const isCurrent = candidate.id === item.projectId;
                          return (
                            <button
                              key={candidate.id}
                              type="button"
                              onClick={() =>
                                onProjectPickerSelect?.(item, candidate.id)
                              }
                              className={cn(
                                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                                isCurrent
                                  ? "bg-[rgb(var(--theme-primary-rgb))]/15 text-white"
                                  : "text-zinc-300 hover:bg-zinc-800 hover:text-white",
                              )}
                            >
                              <span
                                className="h-3 w-3 flex-shrink-0 rounded-full"
                                style={{ backgroundColor: candidate.color }}
                              />
                              <span className="flex-1 truncate">
                                {candidate.name}
                              </span>
                              {isCurrent ? (
                                <Check className="h-4 w-4 text-[rgb(var(--theme-primary-rgb))]" />
                              ) : null}
                            </button>
                          );
                        })
                      ) : (
                        <div className="px-3 py-2 text-sm text-zinc-500">
                          No matching projects
                        </div>
                      )}

                      {projectSearchQuery.trim() ? (
                        <button
                          type="button"
                          onClick={() => onProjectCreate?.(item)}
                          disabled={isCreatingProject}
                          className="flex w-full items-center gap-2 border-t border-zinc-700 px-3 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-zinc-800 hover:text-white disabled:opacity-50"
                        >
                          {isCreatingProject ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                          <span className="truncate">
                            Add New Project &quot;{projectSearchQuery.trim()}&quot;
                          </span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        );
        })}
      </div>

      {hoverPreview
        ? (() => {
            const entry = bodyCacheRef.current.get(hoverPreview.threadId);
            return (
              <div
                className="pointer-events-none fixed z-50 w-[min(512px,90vw)] max-h-[60vh] overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950/95 px-4 py-3 text-xs leading-5 text-zinc-200 shadow-2xl backdrop-blur"
                style={{
                  top: `${hoverPreview.top}px`,
                  left: `${hoverPreview.left}px`,
                }}
              >
                {/* Arrow pointing up at the hovered AI title */}
                <div
                  aria-hidden
                  className="absolute -top-[5px] left-8 h-2.5 w-2.5 rotate-45 border-l border-t border-zinc-700 bg-zinc-950"
                />
                {entry === "loading" || entry === undefined ? (
                  <div className="flex items-center gap-2 text-zinc-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading message…
                  </div>
                ) : entry === "error" || entry.html === null ? (
                  // No HTML body available (or fetch failed) → plain-text preview.
                  <span className="line-clamp-6 break-words">
                    {hoverPreview.fallbackText}
                  </span>
                ) : (
                  // Reuse the same sanitized HTML renderer as the thread modal.
                  <EmailHtmlContent
                    html={entry.html}
                    className="max-h-[calc(60vh-1.5rem)] overflow-hidden break-words [&_img]:max-w-full [&_img]:h-auto"
                  />
                )}
              </div>
            );
          })()
        : null}

      <Dialog
        open={isLinkedTasksModalOpen}
        onOpenChange={(open) => {
          setIsLinkedTasksModalOpen(open);
          if (!open) {
            setLinkedTasksThreadTitle("");
            setLinkedTasks([]);
            setLinkedTasksError(null);
            setLinkedTasksLoading(false);
          }
        }}
      >
        <DialogContent className="max-w-lg border-zinc-800 bg-zinc-950 text-zinc-100">
          <DialogTitle>Linked Tasks</DialogTitle>
          <DialogDescription className="text-zinc-400">
            {linkedTasksThreadTitle
              ? `Tasks generated from ${linkedTasksThreadTitle}.`
              : "Tasks generated from this email thread."}
          </DialogDescription>

          <div className="mt-4">
            {linkedTasksLoading ? (
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading linked tasks...
              </div>
            ) : linkedTasksError ? (
              <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
                {linkedTasksError}
              </div>
            ) : linkedTasks.length === 0 ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-6 text-sm text-zinc-400">
                No linked tasks were found for this thread.
              </div>
            ) : (
              <div className="space-y-2">
                {linkedTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3"
                  >
                    <SquareCheckBig className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
                    <div className="min-w-0">
                      <div className="break-words text-sm font-medium text-zinc-100">
                        {task.name}
                      </div>
                      <div className="mt-1 text-[11px] text-zinc-500">
                        {task.id}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={taskGenItem !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeTaskGenerator();
          }
        }}
      >
        <DialogContent className="max-w-lg border-zinc-800 bg-zinc-950 text-zinc-100">
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-emerald-300" />
            {taskGenPhase === "existing"
              ? "Linked Tasks"
              : "Create Tasks from Email"}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            {taskGenPhase === "existing"
              ? "This email already has tasks linked to it. Here are the tasks generated from this thread."
              : "Focus Forge reads this email with AI and turns the actionable parts into Forge tasks automatically."}
          </DialogDescription>

          <div className="mt-4">
            {taskGenPhase === "running" ? (
              <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-6 text-sm text-zinc-300">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-300" />
                Analyzing this email and generating tasks…
              </div>
            ) : taskGenPhase === "error" ? (
              <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
                {taskGenError || "Failed to generate tasks."}
              </div>
            ) : taskGenResults.length === 0 ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-6 text-sm text-zinc-400">
                {taskGenPhase === "existing"
                  ? "No linked tasks were found for this thread."
                  : "The AI did not find any actionable tasks in this email."}
              </div>
            ) : (
              <div className="space-y-2">
                {taskGenPhase === "done" ? (
                  <div className="inline-flex items-center gap-2 text-sm text-emerald-300">
                    <Sparkles className="h-4 w-4" />
                    Created {taskGenResults.length} task
                    {taskGenResults.length === 1 ? "" : "s"}.
                  </div>
                ) : null}
                {taskGenResults.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3"
                  >
                    <SquareCheckBig className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                    <div className="min-w-0">
                      <div className="break-words text-sm font-medium text-zinc-100">
                        {task.name}
                      </div>
                      <div className="mt-1 text-[11px] text-zinc-500">
                        {task.id}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {taskGenPhase !== "running" ? (
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={closeTaskGenerator}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
              >
                Dismiss
              </button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
