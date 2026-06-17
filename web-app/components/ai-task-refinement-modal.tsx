"use client";

import { useEffect, useState } from "react";
import { Sparkles, Mail, Loader2, CheckCircle2, ShieldOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  classificationLabel,
  formatConfidence,
  hasGenuineRationale,
  type AiRationaleSignals,
} from "@/lib/email-inbox/ai-task-origin";

interface AiTaskRefinementModalProps {
  open: boolean;
  onClose: () => void;
  threadId: string | null;
  taskName: string;
  /** Per-task rationale snapshot stored on the email_thread_tasks link, if any. */
  fallbackRationale?: string | null;
}

export function AiTaskRefinementModal({
  open,
  onClose,
  threadId,
  taskName,
  fallbackRationale,
}: AiTaskRefinementModalProps) {
  const [loading, setLoading] = useState(false);
  const [signals, setSignals] = useState<AiRationaleSignals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [excluding, setExcluding] = useState(false);
  const [excluded, setExcluded] = useState(false);

  useEffect(() => {
    if (!open || !threadId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setExcluded(false);
    setSignals(null);
    fetch(`/api/email/threads/${threadId}/ai-rationale`, {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: AiRationaleSignals) => {
        if (!cancelled) setSignals(data);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the AI's reasoning.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, threadId]);

  const handleExclude = async () => {
    if (!threadId) return;
    setExcluding(true);
    try {
      const res = await fetch(
        `/api/email/threads/${threadId}/exclude-from-tasks`,
        { method: "POST", credentials: "include" },
      );
      if (!res.ok) throw new Error(String(res.status));
      setExcluded(true);
    } catch {
      setError("Could not save your preference. Please try again.");
    } finally {
      setExcluding(false);
    }
  };

  // Prefer the live thread reason; fall back to the per-task stored rationale.
  const reason = signals?.reason ?? fallbackRationale ?? null;
  const genuine = hasGenuineRationale({ reason });
  const confidenceLabel = formatConfidence(signals?.confidence);
  const classLabel = classificationLabel(signals?.classification);

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-400" />
            Why the AI created this task
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            This task was generated automatically from an email the AI judged
            worth acting on.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-1 flex flex-col gap-3 text-sm">
          {/* Source email */}
          <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-zinc-400">
              <Mail className="h-3.5 w-3.5 text-sky-400/80" />
              Source email
            </div>
            <div className="font-medium text-zinc-100 break-words">
              {signals?.subject || taskName}
            </div>
            {(signals?.senderName || signals?.senderEmail) && (
              <div className="mt-0.5 text-xs text-zinc-400 break-words">
                {signals?.senderName
                  ? `${signals.senderName}${signals.senderEmail ? ` <${signals.senderEmail}>` : ""}`
                  : signals?.senderEmail}
              </div>
            )}
          </div>

          {/* Signals */}
          <div className="flex flex-wrap gap-1.5">
            {classLabel && (
              <span className="rounded-full border border-zinc-700 bg-zinc-800/60 px-2 py-0.5 text-[11px] text-zinc-300">
                {classLabel}
              </span>
            )}
            {confidenceLabel && (
              <span className="rounded-full border border-violet-700/50 bg-violet-900/30 px-2 py-0.5 text-[11px] text-violet-200">
                {confidenceLabel} confidence
              </span>
            )}
          </div>

          {/* Rationale (honest about thin data) */}
          <div>
            <div className="mb-1 text-xs font-medium text-zinc-400">
              AI reasoning
            </div>
            {loading ? (
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
              </div>
            ) : genuine ? (
              <p className="text-zinc-200 whitespace-pre-wrap break-words">
                {reason}
              </p>
            ) : (
              <p className="text-zinc-400 italic">
                No detailed reasoning was recorded for this email. The AI relied
                on the signals shown above
                {classLabel || confidenceLabel ? "" : " (none captured)"} to
                decide it was task-worthy.
              </p>
            )}
            {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
          </div>
        </div>

        <DialogFooter className="mt-3 flex-col gap-2 sm:flex-col">
          {excluded ? (
            <div className="flex items-center gap-2 rounded-md border border-emerald-800/60 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              Got it — we&apos;ll avoid creating tasks for emails like this.
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={handleExclude}
              disabled={excluding || !threadId}
              className="w-full justify-center gap-2 border-zinc-700 text-zinc-200 hover:bg-zinc-800"
            >
              {excluding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldOff className="h-4 w-4" />
              )}
              Don&apos;t create tasks for emails like this
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={onClose}
            className="w-full justify-center text-zinc-400 hover:text-zinc-200"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
