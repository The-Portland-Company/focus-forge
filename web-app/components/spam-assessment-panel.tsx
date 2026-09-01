"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, MessageSquare, ScanSearch, Send } from "lucide-react";

import type { SpamAssessment } from "@/lib/spam/assessment";
import type { SpamPolicyDraft, SpamTrainerTurn } from "@/lib/spam/trainer";

/**
 * The live half of the spam explainability panel: what the AI thinks of THIS
 * email, and a conversation to correct it.
 *
 * Analysis costs a model call, so it never runs on open — the user presses
 * Analyze. When an assessment was already produced (cached on the thread from a
 * previous run) it is shown immediately instead, which is the "unless it's
 * already been run" half of the requirement.
 */
/**
 * Turn a raw provider failure into one plain sentence. When every model in the
 * chain is out of credits the API surfaces the provider's own billing text
 * (e.g. "credit balance is too low"); a wall of that is not something the user
 * can act on, so collapse it to a single line that names the cause and points
 * back to the local, free spam check that still works.
 */
function friendlyAnalysisError(message: string): string {
  const m = message.toLowerCase();
  const billing =
    /credit|quota|billing|balance|spending limit|insufficient|payment/.test(m);
  if (billing) {
    return "AI analysis is temporarily unavailable — the AI provider credits are exhausted. The local spam filter still runs on every email; add credits or a free fallback model to restore the written explanation.";
  }
  return message;
}

export function SpamAssessmentPanel({ threadId }: { threadId: string }) {
  const [assessment, setAssessment] = useState<SpamAssessment | null>(null);
  const [loadingCached, setLoadingCached] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [turns, setTurns] = useState<SpamTrainerTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [policy, setPolicy] = useState<SpamPolicyDraft | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  // Read-only: shows a previous run without spending anything.
  useEffect(() => {
    let cancelled = false;
    setLoadingCached(true);
    setAssessment(null);
    setTurns([]);
    setPolicy(null);
    setError(null);
    fetch(`/api/email/threads/${threadId}/spam-assessment`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled) setAssessment(data?.assessment ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingCached(false);
      });
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
    });
  }, [turns, policy]);

  const analyze = useCallback(
    async (force: boolean) => {
      setAnalyzing(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/email/threads/${threadId}/spam-assessment`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ force }),
          },
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.error || "Analysis failed");
        }
        setAssessment(data.assessment);
      } catch (caught) {
        setError(
          friendlyAnalysisError(
            caught instanceof Error ? caught.message : "Analysis failed",
          ),
        );
      } finally {
        setAnalyzing(false);
      }
    },
    [threadId],
  );

  const sendTurn = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    const nextTurns: SpamTrainerTurn[] = [...turns, { role: "user", content }];
    setTurns(nextTurns);
    setDraft("");
    setSending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/email/threads/${threadId}/spam-assessment/train`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ turns: nextTurns }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "The AI did not reply");
      setTurns([...nextTurns, { role: "assistant", content: data.reply }]);
    } catch (caught) {
      setError(
        friendlyAnalysisError(
          caught instanceof Error ? caught.message : "The AI did not reply",
        ),
      );
    } finally {
      setSending(false);
    }
  };

  const finalize = async () => {
    if (turns.length === 0 || finalizing) return;
    setFinalizing(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/email/threads/${threadId}/spam-assessment/train`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ turns, finalize: true }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Could not write a rule");
      setPolicy(data.policy);
    } catch (caught) {
      setError(
        friendlyAnalysisError(
          caught instanceof Error ? caught.message : "Could not write a rule",
        ),
      );
    } finally {
      setFinalizing(false);
    }
  };

  const verdictIsSpam = assessment?.verdict === "spam";

  return (
    <div className="mb-5 rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-100">
          <ScanSearch className="h-4 w-4 text-amber-300" />
          What the AI makes of this email
        </h3>
        {!loadingCached ? (
          <button
            type="button"
            onClick={() => analyze(Boolean(assessment))}
            disabled={analyzing}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-50"
          >
            {analyzing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ScanSearch className="h-3.5 w-3.5" />
            )}
            {assessment ? "Re-analyze" : "Analyze"}
          </button>
        ) : null}
      </div>

      {loadingCached ? (
        <p className="mt-3 text-sm text-zinc-500">Checking for a saved analysis…</p>
      ) : !assessment ? (
        <p className="mt-3 text-sm text-zinc-400">
          This email has not been analyzed yet. Analysis runs only when you ask
          for it — press Analyze to see how it would be rated, and why.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                verdictIsSpam
                  ? "bg-amber-500/15 text-amber-300"
                  : "bg-emerald-500/15 text-emerald-300"
              }`}
            >
              {verdictIsSpam ? "Would mark as spam" : "Would not mark as spam"}
            </span>
            <span className="text-xs text-zinc-500">
              {Math.round(assessment.confidence * 100)}% sure
              {assessment.model ? ` · ${assessment.model}` : ""}
            </span>
          </div>

          <p className="text-sm text-zinc-300">{assessment.summary}</p>

          <ul className="space-y-1.5">
            {assessment.signals.map((signal, index) => (
              <li
                key={`${signal.signal}-${index}`}
                className="flex gap-2 text-xs text-zinc-400"
              >
                <span
                  aria-hidden
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                    signal.direction === "spam"
                      ? "bg-amber-400"
                      : "bg-emerald-400"
                  }`}
                />
                <span>
                  <span className="font-medium text-zinc-200">
                    {signal.signal}
                  </span>{" "}
                  — {signal.detail}
                </span>
              </li>
            ))}
          </ul>

          {assessment.appliedPolicies.length > 0 ? (
            <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-2.5">
              <div className="text-[11px] uppercase tracking-wide text-zinc-500">
                Your rules it applied
              </div>
              <ul className="mt-1 space-y-1">
                {assessment.appliedPolicies.map((statement) => (
                  <li key={statement} className="text-xs text-zinc-300">
                    {statement}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}

      {assessment ? (
        <div className="mt-4 border-t border-zinc-800 pt-3">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <MessageSquare className="h-3.5 w-3.5" />
            Teach it
          </h4>
          <p className="mt-1.5 text-xs text-zinc-500">
            Disagree, or explain what it missed. When you are done, turn the
            conversation into a rule that applies to future mail.
          </p>

          {turns.length > 0 ? (
            <div
              ref={transcriptRef}
              className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1"
            >
              {turns.map((turn, index) => (
                <div
                  key={index}
                  className={`rounded-lg px-3 py-2 text-sm ${
                    turn.role === "user"
                      ? "bg-zinc-800 text-zinc-100"
                      : "border border-zinc-800 bg-zinc-900/60 text-zinc-300"
                  }`}
                >
                  {turn.content}
                </div>
              ))}
              {sending ? (
                <div className="flex items-center gap-2 px-1 text-xs text-zinc-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Thinking…
                </div>
              ) : null}
            </div>
          ) : null}

          {policy ? (
            <div className="mt-3 rounded-lg border border-emerald-800/60 bg-emerald-950/30 p-3">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-emerald-300">
                <Check className="h-3.5 w-3.5" />
                Rule saved
              </div>
              <p className="mt-1.5 text-sm text-emerald-100">
                {policy.statement}
              </p>
            </div>
          ) : (
            <div className="mt-3 flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendTurn();
                  }
                }}
                rows={2}
                placeholder="This is a customer inquiry, not a pitch…"
                className="min-h-0 flex-1 resize-y rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 ring-theme"
              />
              <button
                type="button"
                onClick={() => void sendTurn()}
                disabled={!draft.trim() || sending}
                aria-label="Send"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          )}

          {turns.length > 0 && !policy ? (
            <button
              type="button"
              onClick={() => void finalize()}
              disabled={finalizing}
              className="mt-2 inline-flex items-center gap-2 rounded-lg bg-theme-gradient px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              {finalizing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Turn this into a rule
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 text-xs text-red-300">{error}</p>
      ) : null}
    </div>
  );
}
