"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Star, Mail } from "lucide-react";
import type { Database, InboxItem } from "@/lib/types";

const EmailThreadModal = dynamic(
  () =>
    import("@/components/email-thread-modal").then(
      (mod) => mod.EmailThreadModal,
    ),
  { ssr: false },
);

/** Starred folder for the Email Inbox. "Starred" is an app-level flag on
 *  email_threads (is_starred) — Gmail stars are not synced — toggled via
 *  POST /api/email/threads/:id/star. Lists every starred thread regardless of
 *  folder; clicking a row opens the thread, and the star button unstars it. */
export function EmailStarredView({
  data,
  onRefresh,
}: {
  data: Database;
  onRefresh?: () => void;
}) {
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const starred = useMemo(
    () =>
      data.inboxItems
        .filter((item) => item.isStarred && item.status !== "deleted")
        .sort((a, b) =>
          (b.latestMessageAt || b.updatedAt || "").localeCompare(
            a.latestMessageAt || a.updatedAt || "",
          ),
        ),
    [data.inboxItems],
  );

  const unstar = async (item: InboxItem) => {
    setBusyIds((prev) => new Set(prev).add(item.id));
    try {
      await fetch(`/api/email/threads/${item.id}/star`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isStarred: false }),
      });
      onRefresh?.();
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center gap-2">
        <Star className="h-5 w-5 text-amber-400" />
        <h1 className="text-lg font-semibold text-white">Starred</h1>
        <span className="text-xs text-zinc-500">{starred.length}</span>
      </div>

      {starred.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-10 text-center text-sm text-zinc-500">
          No starred emails. Star a thread to keep it here.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {starred.map((item) => (
            <li
              key={item.id}
              className="group flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3 transition-colors hover:border-zinc-700"
            >
              <button
                type="button"
                disabled={busyIds.has(item.id)}
                onClick={() => unstar(item)}
                title="Unstar"
                className="mt-0.5 shrink-0 text-amber-400 transition-colors hover:text-amber-300 disabled:opacity-50"
              >
                <Star className="h-4 w-4 fill-amber-400" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpenThreadId(item.id);
                  setIsModalOpen(true);
                }}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`truncate text-sm ${item.isUnread ? "font-semibold text-white" : "font-medium text-zinc-200"}`}
                  >
                    {item.subject || item.actionTitle || "(no subject)"}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-zinc-500">
                  <Mail className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {item.mailboxName || item.mailboxEmailAddress || ""}
                    {item.previewText ? ` — ${item.previewText}` : ""}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <EmailThreadModal
        open={isModalOpen && Boolean(openThreadId)}
        threadId={openThreadId}
        projects={data.projects}
        onRefresh={onRefresh}
        onOpenChange={setIsModalOpen}
      />
    </div>
  );
}
