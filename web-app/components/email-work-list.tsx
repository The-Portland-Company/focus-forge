"use client";

import {
  AlertTriangle,
  AtSign,
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
  onSelect?: (item: InboxItem) => void;
  onSenderClick?: (sender: { name: string; email: string }) => void;
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
  return status !== "active";
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
        ? "border-0 bg-white/12 ring-0 shadow-none"
        : "border-0 bg-white/10 ring-0 shadow-none hover:bg-white/12"
      : params.isSelected
        ? "border border-[rgb(var(--theme-primary-rgb))]/40 bg-[rgb(var(--theme-primary-rgb))]/10"
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
  onSelect,
  onSenderClick,
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
                "flex min-w-0 items-start justify-between gap-3 transition-opacity",
                item.isUnread ? "opacity-100" : "opacity-[0.42] hover:opacity-[0.58]",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                  {statusIcon(item.status)}
                  {item.isUnread ? (
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 rounded-full bg-[rgb(var(--theme-primary-rgb))]"
                    />
                  ) : null}
                  {sender?.emailAddress ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-xs",
                        item.isUnread ? "text-zinc-300" : "text-zinc-500",
                      )}
                    >
                      <AtSign className="h-3 w-3" />
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
                {item.isUnread ? (
                  <div className="rounded-full border border-[rgb(var(--theme-primary-rgb))]/45 bg-[rgb(var(--theme-primary-rgb))]/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[rgb(var(--theme-primary-rgb))]">
                    Unread
                  </div>
                ) : null}
                {shouldShowStatusBadge(item.status) ? (
                  <div className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
                    {statusLabel(item.status)}
                  </div>
                ) : null}
              </div>
            </div>

            <div
              className={cn(
                getEmailWorkPreviewClassName(item.isUnread),
                item.isUnread ? "opacity-100" : "opacity-[0.42] hover:opacity-[0.58]",
              )}
            >
              {formatInboxPreviewText(item.previewText || item.summaryText)}
            </div>

            <div
              className={cn(
                "mt-3 flex min-w-0 flex-wrap items-center gap-3 text-xs text-zinc-500 transition-opacity",
                item.isUnread ? "text-zinc-400 opacity-100" : "opacity-[0.42] hover:opacity-[0.58]",
              )}
            >
              <span className="inline-flex items-center gap-1 break-words">
                <Mail className="h-3.5 w-3.5" />
                {mailbox?.name || item.mailboxName || "Mailbox"}
              </span>
              {project ? (
                <span className="inline-flex items-center gap-1 break-words">
                  <FolderSearch className="h-3.5 w-3.5" />
                  {project.name}
                </span>
              ) : null}
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
        );
      })}
    </div>
  );
}
