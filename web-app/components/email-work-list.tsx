"use client";

import {
  AlertTriangle,
  Bot,
  FolderSearch,
  Mail,
  MessageSquare,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { Tooltip } from "@/components/tooltip";
import type {
  InboxItem,
  InboxParticipant,
  Mailbox,
  Project,
} from "@/lib/types";
import { cn } from "@/lib/utils";

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
  emptyLabel?: string;
};

function statusIcon(status: InboxItem["status"]) {
  switch (status) {
    case "quarantine":
      return <ShieldAlert className="h-4 w-4 text-amber-400" />;
    case "needs_project":
      return <FolderSearch className="h-4 w-4 text-sky-400" />;
    case "spam":
      return <AlertTriangle className="h-4 w-4 text-red-400" />;
    default:
      return <Mail className="h-4 w-4 text-zinc-400" />;
  }
}

function statusLabel(status: InboxItem["status"]) {
  switch (status) {
    case "needs_project":
      return "Needs Project";
    case "quarantine":
      return "Quarantine";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
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

  return (
    normalizedActionTitle.toLocaleLowerCase() !==
    formatEmailSubject(subject).toLocaleLowerCase()
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

export function shouldShowStatusBadge(status: InboxItem["status"]) {
  return status === "quarantine" || status === "spam";
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

export function getEmailWorkItemClassName(params: {
  isSelected: boolean;
  isUnread?: boolean;
}) {
  return cn(
    "w-full min-w-0 rounded-xl px-4 py-3 text-left transition-colors",
    params.isUnread
      ? params.isSelected
        ? "border border-[rgb(var(--theme-primary-rgb))]/45 bg-[rgb(var(--theme-primary-rgb))]/12 shadow-none"
        : "border border-[rgb(var(--theme-primary-rgb))]/20 bg-[rgb(var(--theme-primary-rgb))]/[0.08] ring-0 shadow-none hover:border-[rgb(var(--theme-primary-rgb))]/35 hover:bg-[rgb(var(--theme-primary-rgb))]/12"
      : params.isSelected
        ? "border border-zinc-700 bg-zinc-900/80"
        : "border border-zinc-800/80 bg-zinc-950/30 hover:border-zinc-700 hover:bg-zinc-900/60",
  );
}

export function getEmailWorkPreviewClassName(isUnread?: boolean) {
  return cn(
    "mt-3 break-words whitespace-normal text-sm",
    isUnread ? "font-medium text-zinc-100" : "text-zinc-400",
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
  emptyLabel = "No email work yet.",
}: EmailWorkListProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-6 text-sm text-zinc-500">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const mailbox = mailboxes.find(
          (candidate) => candidate.id === item.mailboxId,
        );
        const project = projects.find(
          (candidate) => candidate.id === item.projectId,
        );
        const sender = getPrimarySenderParticipant(item.participants);
        const senderName = formatParticipantName(sender);
        const ccLine = formatParticipantLine(item.participants, "cc");
        const summaryText = item.summaryText
          ? formatInboxPreviewText(item.summaryText)
          : null;
        const previewText = item.previewText
          ? formatInboxPreviewText(item.previewText)
          : summaryText || "No summary available yet.";
        const showSecondaryActionTitle = shouldShowSecondaryActionTitle(
          item.actionTitle,
          item.subject,
        );

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
              isSelected: selectedId === item.id,
              isUnread: item.isUnread,
            })}
          >
            <div
              className={cn(
                "group flex min-w-0 flex-col transition-opacity",
                item.isUnread ? "opacity-100" : "opacity-100",
              )}
            >
              <div
                className={cn(
                  "flex min-w-0 items-start justify-between gap-3",
                  item.isUnread ? "opacity-100" : "opacity-100",
                )}
              >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                  {statusIcon(item.status)}
                  {sender?.emailAddress ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-xs",
                        item.isUnread ? "text-zinc-300" : "text-zinc-500",
                      )}
                    >
                      <span>From:</span>
                      <Tooltip content={sender.emailAddress} className="w-auto">
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
                        item.isUnread ? "text-zinc-300" : "text-zinc-500",
                      )}
                    >
                      From: Unknown
                    </span>
                  )}
                  {ccLine ? (
                    <span
                      className={cn(
                        "break-words text-xs",
                        item.isUnread ? "text-zinc-300" : "text-zinc-500",
                      )}
                    >
                      {ccLine}
                    </span>
                  ) : null}
                </div>
                <div
                  className={cn(
                    "mt-2 break-words text-white",
                    item.isUnread ? "font-semibold" : "font-normal",
                  )}
                >
                  {formatEmailSubject(item.subject)}
                </div>
                {showSecondaryActionTitle ? (
                  <div
                    className={cn(
                      "mt-1 break-words text-sm",
                      item.isUnread ? "font-semibold text-white" : "font-normal text-zinc-500",
                    )}
                  >
                    {item.actionTitle}
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <div className={getEmailReadStateBadgeClassName(item.isUnread)}>
                  {getEmailReadStateLabel(item.isUnread)}
                </div>
                {shouldShowStatusBadge(item.status) ? (
                  <div className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
                    {statusLabel(item.status)}
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
                      item.isUnread ? "text-zinc-200" : "text-zinc-400",
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
                      getEmailWorkPreviewClassName(item.isUnread),
                      "mt-0",
                      item.isUnread ? "opacity-100" : "opacity-100",
                    )}
                  >
                    {previewText}
                  </div>
                </div>
              ) : null}

              <div
                className={cn(
                  "mt-3 flex min-w-0 flex-wrap items-center gap-3 text-xs text-zinc-500 transition-opacity",
                  item.isUnread ? "text-zinc-400 opacity-100" : "opacity-100",
                )}
              >
                <span className="inline-flex items-center gap-1 break-words">
                  <Mail className="h-3.5 w-3.5" />
                  {mailbox?.name || item.mailboxName || "Mailbox"}
                </span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onProjectClick?.(item);
                  }}
                  className="inline-flex items-center gap-1 break-words rounded-md px-1 py-0.5 text-left transition-colors hover:bg-zinc-800/70 hover:text-white"
                >
                  <FolderSearch className="h-3.5 w-3.5" />
                  {project ? (
                    project.name
                  ) : (
                    <span className="text-zinc-500">No Project</span>
                  )}
                </button>
                <span className="inline-flex items-center gap-1 break-words">
                  <MessageSquare className="h-3.5 w-3.5" />
                  {item.derivedTaskCount} linked task
                  {item.derivedTaskCount === 1 ? "" : "s"}
                </span>
                {item.actionConfidence ? (
                  <span className="inline-flex items-center gap-1 break-words">
                    <Sparkles className="h-3.5 w-3.5" />
                    {Math.round(item.actionConfidence * 100)}% confidence
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
