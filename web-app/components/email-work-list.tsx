"use client";

import * as Popover from "@radix-ui/react-popover";
import { useState, type CSSProperties } from "react";
import {
  Bot,
  Check,
  ChevronDown,
  FolderSearch,
  Loader2,
  Mail,
  MessageSquare,
  Plus,
  Search,
  Skull,
  Sparkles,
  SquareCheckBig,
} from "lucide-react";
import { Tooltip } from "@/components/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
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
  onThreadAction?: (item: InboxItem, action: ThreadAction) => Promise<void> | void;
  emptyLabel?: string;
};

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
    return `${displayName} <${emailAddress}>`;
  }

  return emailAddress;
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
  if (!participant) return "Unknown";

  const displayName = participant.displayName?.trim();
  const emailAddress = participant.emailAddress.trim();

  return displayName && displayName !== emailAddress
    ? displayName
    : emailAddress;
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
  const fallback = role === "from" ? "Unknown" : null;

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

  if (reviewState === "spam") {
    return "Spam";
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

  const withoutHtml = value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, " ");

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
        const mailboxBadgeLabel = getMailboxBadgeLabel(mailboxLabel);
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
        const summaryText = shouldShowAiSummary({
          summaryText: rawSummaryText,
          previewText: item.previewText
            ? formatInboxPreviewText(item.previewText)
            : null,
          forceShow: alwaysShowSummary,
        })
          ? rawSummaryText
          : null;
        const previewText = item.previewText
          ? formatInboxPreviewText(item.previewText)
          : rawSummaryText || "No summary available yet.";
        const showSecondaryActionTitle = shouldShowSecondaryActionTitle(
          item.actionTitle,
          item.subject,
        );
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
            className={getEmailWorkItemClassName({
              isSelected,
              isUnread: isVisuallyUnread,
            })}
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
                  {sender?.emailAddress ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-xs",
                        isVisuallyUnread ? "text-zinc-300" : "text-zinc-500",
                      )}
                    >
                      <span>From:</span>
                      <Tooltip
                        content={sender.emailAddress}
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
                      From: Unknown
                    </span>
                  )}
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 break-words text-xs",
                      isVisuallyUnread ? "text-zinc-300" : "text-zinc-500",
                    )}
                  >
                    <span
                      className="inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-semibold uppercase tracking-wide text-black"
                      style={{ backgroundColor: mailboxAccentColor }}
                    >
                      {mailboxBadgeLabel}
                    </span>
                    <span>To:</span>
                    <span
                      className="font-medium"
                      style={{ color: mailboxAccentColor }}
                    >
                      {mailboxLabel}
                    </span>
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
                </div>
                <div className="mt-1 flex min-w-0 items-start gap-2">
                  {shouldShowSpamIndicator(item) ? (
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
                  <div
                    className={cn(
                      "min-w-0 break-words text-white",
                      isVisuallyUnread ? "font-semibold" : "font-normal",
                    )}
                  >
                    {formatEmailSubject(item.subject)}
                  </div>
                </div>
                {showSecondaryActionTitle ? (
                  <div
                    className={cn(
                      "mt-1 break-words text-sm",
                      isVisuallyUnread ? "text-white" : "text-zinc-500",
                    )}
                  >
                    {item.actionTitle}
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {shouldShowStatusBadge(item) && reviewBadgeLabel ? (
                  <div className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
                    {reviewBadgeLabel}
                  </div>
                ) : null}
              </div>
              </div>

              {summaryText ? (
                <div
                  className={cn(
                    "overflow-hidden transition-all duration-200",
                    alwaysShowSummary
                      ? "mt-3 max-h-24 opacity-100"
                      : "max-h-0 opacity-0 group-hover:mt-3 group-hover:max-h-24 group-hover:opacity-100",
                  )}
                >
                  <div
                    className={cn(
                      "inline-flex max-w-full items-start gap-2 text-sm italic",
                      isVisuallyUnread ? "text-zinc-200" : "text-zinc-400",
                    )}
                  >
                    <Bot className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
                    <span className="min-w-0 break-words">{summaryText}</span>
                  </div>
                </div>
              ) : null}

              {item.previewText ? (
                <div
                  className={cn(
                    "overflow-hidden transition-all duration-200",
                    alwaysShowExcerpt
                      ? cn(
                          "max-h-28 opacity-100",
                          summaryText ? "mt-2" : "mt-3",
                        )
                      : cn(
                          "max-h-0 opacity-0",
                          summaryText
                            ? "group-hover:mt-2"
                            : "group-hover:mt-3",
                          "group-hover:max-h-28 group-hover:opacity-100",
                        ),
                  )}
                >
                  <div
                    className={cn(
                      getEmailWorkPreviewClassName(isVisuallyUnread),
                      "mt-0",
                      isVisuallyUnread ? "opacity-100" : "opacity-100",
                    )}
                  >
                    {previewText}
                  </div>
                </div>
              ) : null}

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
    </>
  );
}
