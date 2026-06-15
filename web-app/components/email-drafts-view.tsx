"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Loader2, Clock, AlertCircle, Send } from "lucide-react";
import type { EmailReplyDraft } from "@/lib/types";

/** Minimal Drafts folder for the Email Inbox. Reply drafts (manual + AI) live in
 *  email_reply_drafts and are surfaced through /api/email/reply-drafts. Each row
 *  shows subject, recipient(s), status, and scheduled time when present. Drafts
 *  are not thread-shaped, so this is a flat list rather than the thread inbox. */
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

function formatScheduled(iso?: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  return t.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function EmailDraftsView() {
  const [drafts, setDrafts] = useState<EmailReplyDraft[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/email/reply-drafts", {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to load drafts");
        const data = (await res.json()) as EmailReplyDraft[];
        if (!cancelled) setDrafts(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load drafts");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sorted = useMemo(
    () =>
      (drafts || [])
        .slice()
        .sort((a, b) =>
          (b.updatedAt || "").localeCompare(a.updatedAt || ""),
        ),
    [drafts],
  );

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center gap-2">
        <FileText className="h-5 w-5 text-zinc-400" />
        <h1 className="text-lg font-semibold text-white">Drafts</h1>
        {drafts ? (
          <span className="text-xs text-zinc-500">{sorted.length}</span>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : !drafts ? (
        <div className="flex items-center gap-2 px-4 py-8 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading drafts…
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-10 text-center text-sm text-zinc-500">
          No drafts yet.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {sorted.map((draft) => {
            const meta = STATUS_META[draft.status] || STATUS_META.draft;
            const StatusIcon = meta.icon;
            const recipients =
              (draft.to || [])
                .map((r) => r.name || r.email)
                .filter(Boolean)
                .join(", ") || "—";
            const scheduled = formatScheduled(draft.scheduledFor);
            return (
              <li
                key={draft.id}
                className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-white">
                      {draft.subject ||
                        draft.threadSubject ||
                        "(no subject)"}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-zinc-500">
                      To: {recipients}
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
                {draft.status === "failed" && draft.lastError ? (
                  <div className="mt-1.5 text-xs sm:text-[11px] text-red-400/80">
                    {draft.lastError}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
