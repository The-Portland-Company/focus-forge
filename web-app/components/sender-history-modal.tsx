"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, Mail } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ConversationEntry, InboxItem } from "@/lib/types";
import { cn } from "@/lib/utils";

type SenderHistoryThread = InboxItem & {
  conversation?: ConversationEntry[];
};

type SenderHistoryModalProps = {
  open: boolean;
  senderName: string | null;
  senderEmail: string | null;
  onOpenChange: (open: boolean) => void;
};

const subjectLabel = (subject?: string | null) =>
  subject?.trim() || "Untitled email";

export function SenderHistoryModal({
  open,
  senderName,
  senderEmail,
  onOpenChange,
}: SenderHistoryModalProps) {
  const [threads, setThreads] = useState<SenderHistoryThread[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [expandedThreadIds, setExpandedThreadIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !senderEmail) {
      setThreads([]);
      setStatusMessage(null);
      setExpandedThreadIds([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setStatusMessage(null);

    fetch(`/api/email/senders/history?email=${encodeURIComponent(senderEmail)}`, {
      credentials: "include",
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || "Failed to load sender history");
        }
        if (cancelled) return;

        const nextThreads = Array.isArray(payload) ? payload : [];
        setThreads(nextThreads);
        setExpandedThreadIds(nextThreads[0]?.id ? [nextThreads[0].id] : []);
      })
      .catch((error) => {
        if (!cancelled) {
          setThreads([]);
          setStatusMessage(
            error instanceof Error
              ? error.message
              : "Failed to load sender history",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, senderEmail]);

  const threadCountLabel = useMemo(() => {
    const count = threads.length;
    return `${count} thread${count === 1 ? "" : "s"}`;
  }, [threads.length]);

  const toggleThread = (threadId: string) => {
    setExpandedThreadIds((current) =>
      current.includes(threadId)
        ? current.filter((id) => id !== threadId)
        : [...current, threadId],
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden border-zinc-800 bg-zinc-950 p-0 text-zinc-100">
        <div className="border-b border-zinc-800 px-6 py-5">
          <DialogTitle className="text-left text-xl text-white">
            {senderName || senderEmail || "Sender history"}
          </DialogTitle>
          <DialogDescription className="mt-2 flex items-center gap-2 text-left text-sm text-zinc-400">
            <Mail className="h-4 w-4" />
            <span>{senderEmail || "Unknown email"}</span>
            <span className="text-zinc-600">•</span>
            <span>{threadCountLabel}</span>
          </DialogDescription>
        </div>

        <div className="max-h-[calc(85vh-92px)] overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex min-h-[240px] items-center justify-center text-zinc-500">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : statusMessage ? (
            <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
              {statusMessage}
            </div>
          ) : threads.length === 0 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-6 text-sm text-zinc-500">
              No email history found for this sender.
            </div>
          ) : (
            <div className="space-y-3">
              {threads.map((thread) => {
                const isExpanded = expandedThreadIds.includes(thread.id);

                return (
                  <div
                    key={thread.id}
                    className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50"
                  >
                    <button
                      type="button"
                      onClick={() => toggleThread(thread.id)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-800/60"
                    >
                      <span className="truncate text-sm font-medium text-zinc-100">
                        {subjectLabel(thread.subject)}
                      </span>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 flex-shrink-0 text-zinc-500 transition-transform",
                          isExpanded && "rotate-180",
                        )}
                      />
                    </button>

                    {isExpanded ? (
                      <div className="border-t border-zinc-800 bg-zinc-950/35 px-4 py-3">
                        <div className="space-y-2 border-l border-zinc-800 pl-4">
                          {(thread.conversation || []).map((entry) => (
                            <div
                              key={entry.id}
                              className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-300"
                            >
                              {subjectLabel(entry.subject)}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
