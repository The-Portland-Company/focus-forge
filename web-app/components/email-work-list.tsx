"use client";

import {
  AlertTriangle,
  FolderSearch,
  Mail,
  MessageSquare,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import type { InboxItem, Mailbox, Project } from "@/lib/types";

type EmailWorkListProps = {
  items: InboxItem[];
  mailboxes: Mailbox[];
  projects: Project[];
  selectedId?: string | null;
  onSelect?: (item: InboxItem) => void;
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

export function EmailWorkList({
  items,
  mailboxes,
  projects,
  selectedId,
  onSelect,
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

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect?.(item)}
            className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
              selectedId === item.id
                ? "border-[rgb(var(--theme-primary-rgb))]/40 bg-[rgb(var(--theme-primary-rgb))]/10"
                : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/70"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm text-zinc-300">
                  {statusIcon(item.status)}
                  <span className="truncate font-medium">
                    {item.actionTitle}
                  </span>
                </div>
                <div className="mt-1 text-xs text-zinc-500">{item.subject}</div>
              </div>
              <div className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
                {statusLabel(item.status)}
              </div>
            </div>

            <div className="mt-3 text-sm text-zinc-400">
              {item.summaryText ||
                item.previewText ||
                "No summary available yet."}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
              <span className="inline-flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" />
                {mailbox?.name || item.mailboxName || "Mailbox"}
              </span>
              {project ? (
                <span className="inline-flex items-center gap-1">
                  <FolderSearch className="h-3.5 w-3.5" />
                  {project.name}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="h-3.5 w-3.5" />
                {item.derivedTaskCount} linked task
                {item.derivedTaskCount === 1 ? "" : "s"}
              </span>
              {item.actionConfidence ? (
                <span className="inline-flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5" />
                  {Math.round(item.actionConfidence * 100)}% confidence
                </span>
              ) : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
