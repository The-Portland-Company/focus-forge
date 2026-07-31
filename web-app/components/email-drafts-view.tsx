"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Loader2,
  Clock,
  AlertCircle,
  Search,
  Send,
} from "lucide-react";
import { richTextToPlainText } from "@/lib/rich-text";
import type { EmailOutboundDraft, EmailReplyDraft } from "@/lib/types";

/** Drafts folder for the Email Inbox. It covers both kinds of unsent mail:
 *  reply drafts (manual + AI, from email_reply_drafts) and new-email drafts
 *  written in the composer (email_outbound_drafts) — the latter were missing
 *  entirely, so a composer draft never showed up here. Rows are searchable,
 *  filterable by status, stamped with their creation date, and clicking one
 *  reopens it (composer for outbound drafts, thread for replies). */
const STATUS_META: Record<
  string,
  { label: string; className: string; icon: typeof FileText }
> = {
  draft: { label: "Draft", className: "text-zinc-400", icon: FileText },
  scheduled: { label: "Scheduled", className: "text-sky-400", icon: Clock },
  sending: { label: "Sending", className: "text-amber-400", icon: Send },
  failed: { label: "Failed", className: "text-red-400", icon: AlertCircle },
  sent: { label: "Sent", className: "text-emerald-400", icon: Send },
  canceled: { label: "Canceled", className: "text-zinc-500", icon: FileText },
};

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "scheduled", label: "Scheduled" },
  { value: "failed", label: "Failed" },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];

type DraftRow = {
  id: string;
  kind: "outbound" | "reply";
  threadId?: string | null;
  subject: string;
  recipients: string;
  status: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  scheduledFor?: string | null;
  lastError?: string | null;
  searchText: string;
};

function formatDateTime(iso?: string | null): string | null {
  if (!iso) return null;
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return null;
  return value.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year:
      value.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function recipientLabel(
  addresses: { email: string; name?: string | null }[] | null | undefined,
): string {
  const list = (addresses || [])
    .map((address) => address.name || address.email)
    .filter(Boolean);
  return list.length > 0 ? list.join(", ") : "—";
}

export function EmailDraftsView() {
  const router = useRouter();
  const [rows, setRows] = useState<DraftRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Both folders load in parallel; either one failing fails the view so
        // the list is never silently half-complete.
        const [replyResponse, outboundResponse] = await Promise.all([
          fetch("/api/email/reply-drafts", { credentials: "include" }),
          fetch("/api/email/outbound-drafts", { credentials: "include" }),
        ]);
        if (!replyResponse.ok || !outboundResponse.ok) {
          throw new Error("Failed to load drafts");
        }

        const replyDrafts = (await replyResponse.json()) as EmailReplyDraft[];
        const outboundDrafts =
          (await outboundResponse.json()) as EmailOutboundDraft[];

        const mapped: DraftRow[] = [
          ...(Array.isArray(outboundDrafts) ? outboundDrafts : []).map(
            (draft): DraftRow => ({
              id: draft.id,
              kind: "outbound",
              threadId: draft.threadId ?? null,
              subject: draft.subject || "(no subject)",
              recipients: recipientLabel(draft.to),
              status: draft.status,
              createdAt: draft.createdAt,
              updatedAt: draft.updatedAt,
              scheduledFor: draft.scheduledFor,
              lastError: draft.lastError,
              searchText: [
                draft.subject,
                recipientLabel(draft.to),
                recipientLabel(draft.cc),
                draft.contentText ||
                  richTextToPlainText(draft.contentHtml || ""),
                draft.mailboxEmailAddress,
                draft.projectName,
              ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase(),
            }),
          ),
          ...(Array.isArray(replyDrafts) ? replyDrafts : []).map(
            (draft): DraftRow => ({
              id: draft.id,
              kind: "reply",
              threadId: draft.threadId,
              subject: draft.subject || draft.threadSubject || "(no subject)",
              recipients: recipientLabel(draft.to),
              status: draft.status,
              createdAt: draft.createdAt,
              updatedAt: draft.updatedAt,
              scheduledFor: draft.scheduledFor,
              lastError: draft.lastError,
              searchText: [
                draft.subject,
                draft.threadSubject,
                recipientLabel(draft.to),
                recipientLabel(draft.cc),
                draft.contentText ||
                  richTextToPlainText(draft.contentHtml || ""),
                draft.mailboxEmailAddress,
                draft.projectName,
              ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase(),
            }),
          ),
        ];

        if (!cancelled) setRows(mapped);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load drafts");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (rows || [])
      .filter((row) => statusFilter === "all" || row.status === statusFilter)
      .filter((row) => !query || row.searchText.includes(query))
      .sort((left, right) =>
        (right.updatedAt || right.createdAt || "").localeCompare(
          left.updatedAt || left.createdAt || "",
        ),
      );
  }, [rows, search, statusFilter]);

  // Outbound drafts reopen in the composer; reply drafts belong to a thread, so
  // they open that thread where the reply editor already lives.
  const openDraft = (row: DraftRow) => {
    if (row.kind === "outbound") {
      router.push(`/email-inbox?composeDraft=${encodeURIComponent(row.id)}`);
      return;
    }
    if (row.threadId) {
      router.push(`/email-inbox?thread=${encodeURIComponent(row.threadId)}`);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center gap-2">
        <FileText className="h-5 w-5 text-zinc-400" />
        <h1 className="text-lg font-semibold text-white">Drafts</h1>
        {rows ? (
          <span className="text-xs text-zinc-500">{visible.length}</span>
        ) : null}
      </div>

      <div className="mb-4 space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search drafts by subject, recipient, or text"
            aria-label="Search drafts"
            className="h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 pl-9 pr-3 text-sm text-white placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setStatusFilter(option.value)}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                statusFilter === option.value
                  ? "border-theme-primary bg-zinc-800 text-white"
                  : "border-zinc-700 bg-zinc-950/40 text-zinc-300 hover:border-zinc-500"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : !rows ? (
        <div className="flex items-center gap-2 px-4 py-8 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading drafts…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-10 text-center text-sm text-zinc-500">
          {rows.length === 0
            ? "No drafts yet."
            : "No drafts match this search or filter."}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {visible.map((row) => {
            const meta = STATUS_META[row.status] || STATUS_META.draft;
            const StatusIcon = meta.icon;
            const scheduled = formatDateTime(row.scheduledFor);
            const created = formatDateTime(row.createdAt);
            return (
              <li key={`${row.kind}-${row.id}`}>
                <button
                  type="button"
                  onClick={() => openDraft(row)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-left transition-colors hover:border-zinc-600 hover:bg-zinc-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-white">
                        {row.subject}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-zinc-500">
                        To: {row.recipients}
                        {created ? (
                          <span className="text-zinc-600"> · {created}</span>
                        ) : null}
                      </div>
                    </div>
                    <div
                      className={`flex shrink-0 items-center gap-1 text-xs ${meta.className}`}
                    >
                      <StatusIcon className="h-3.5 w-3.5" />
                      {meta.label}
                    </div>
                  </div>
                  {scheduled ? (
                    <div className="mt-1.5 flex items-center gap-1 text-xs sm:text-[11px] text-sky-400/80">
                      <Clock className="h-3 w-3" /> Scheduled for {scheduled}
                    </div>
                  ) : null}
                  {row.status === "failed" && row.lastError ? (
                    <div className="mt-1.5 text-xs sm:text-[11px] text-red-400/80">
                      {row.lastError}
                    </div>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
