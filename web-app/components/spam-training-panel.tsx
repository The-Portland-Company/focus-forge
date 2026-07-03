"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wand2,
} from "lucide-react";
import type { InboxItem, Mailbox } from "@/lib/types";
import { cn } from "@/lib/utils";

type SpamStats = {
  total: number;
  spam: number;
  not_spam: number;
  bySource: Record<string, number>;
  recentAccuracy: number | null;
  recentSampleSize: number;
  /** Optional read-only env context surfaced by GET /api/spam/stats. */
  confidenceThreshold?: number;
  fallbackMode?: "llm" | "private";
};

type SpamNeighbor = {
  id: string;
  label: "spam" | "not_spam";
  source: string;
  weight: number;
  similarity: number;
  score: number;
};

type SpamVerdict = {
  label: "spam" | "not_spam" | null;
  score: number;
  confidence: number;
  neighbors: SpamNeighbor[];
  exampleCount: number;
  threshold: number;
  confident: boolean;
};

type SpamTrainingPanelProps = {
  inboxItems: InboxItem[];
  mailboxes: Mailbox[];
  onRefresh?: () => Promise<void> | void;
};

/** How many recently-classified threads to surface for confirm/correct. */
const RECENT_LIMIT = 20;

function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

/**
 * Build the text embedded when a thread is labeled from a row — subject plus a
 * short body preview, mirroring buildSpamInputText's subject/body shape so the
 * click-to-label signal lines up with how the classifier sees live mail.
 */
function threadLabelText(item: InboxItem): string {
  const subject = (item.subject || item.normalizedSubject || "").trim();
  const body = (item.summaryText || item.previewText || "").trim();
  return [subject ? `Subject: ${subject}` : "", body ? `Body: ${body}` : ""]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000);
}

function Badge({
  tone,
  children,
}: {
  tone: "red" | "green" | "zinc";
  children: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    red: "border-red-500/30 bg-red-500/15 text-red-300",
    green: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
    zinc: "border-zinc-500/30 bg-zinc-500/15 text-zinc-300",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function SpamTrainingPanel({
  inboxItems,
  onRefresh,
}: SpamTrainingPanelProps) {
  const [stats, setStats] = useState<SpamStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [labelingId, setLabelingId] = useState<string | null>(null);
  const [labeledIds, setLabeledIds] = useState<Record<string, "spam" | "not_spam">>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [testerText, setTesterText] = useState("");
  const [isClassifying, setIsClassifying] = useState(false);
  const [verdict, setVerdict] = useState<SpamVerdict | null>(null);
  const [verdictError, setVerdictError] = useState<string | null>(null);

  const recent = useMemo(() => {
    return [...inboxItems]
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
      .slice(0, RECENT_LIMIT);
  }, [inboxItems]);

  const loadStats = async () => {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const res = await fetch("/api/spam/stats", { credentials: "include" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to load spam stats");
      setStats(payload as SpamStats);
    } catch (error) {
      setStatsError(
        error instanceof Error ? error.message : "Failed to load spam stats",
      );
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    void loadStats();
  }, []);

  const updateStatus = (message: string) => {
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(null), 2400);
  };

  const labelThread = async (item: InboxItem, label: "spam" | "not_spam") => {
    const text = threadLabelText(item);
    if (!text) {
      updateStatus("Nothing to label on this thread.");
      return;
    }
    setLabelingId(item.id);
    try {
      const res = await fetch("/api/spam/label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          text,
          label,
          threadId: item.id,
          mailboxId: item.mailboxId ?? null,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to record label");
      setLabeledIds((prev) => ({ ...prev, [item.id]: label }));
      updateStatus(
        label === "spam" ? "Recorded as spam." : "Recorded as not spam.",
      );
      await loadStats();
      await onRefresh?.();
    } catch (error) {
      updateStatus(
        error instanceof Error ? error.message : "Failed to record label",
      );
    } finally {
      setLabelingId(null);
    }
  };

  const runClassify = async () => {
    const text = testerText.trim();
    if (!text) {
      setVerdictError("Paste some text to classify.");
      return;
    }
    setIsClassifying(true);
    setVerdictError(null);
    setVerdict(null);
    try {
      const res = await fetch("/api/spam/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ text }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to classify text");
      setVerdict(payload as SpamVerdict);
    } catch (error) {
      setVerdictError(
        error instanceof Error ? error.message : "Failed to classify text",
      );
    } finally {
      setIsClassifying(false);
    }
  };

  return (
    <div className="min-w-0 space-y-6">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-sm text-zinc-400">
        A private, trainable classifier. Every spam / not-spam label you record
        below teaches a k-NN model over your own mail — no thread content leaves
        your account.
      </div>

      {/* Stats header */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {statsLoading ? (
          <div className="col-span-full rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-6 text-sm text-zinc-500">
            Loading stats…
          </div>
        ) : statsError ? (
          <div className="col-span-full rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
            {statsError}
          </div>
        ) : (
          <>
            <StatCard label="Training examples" value={String(stats?.total ?? 0)} />
            <StatCard
              label="Spam"
              value={String(stats?.spam ?? 0)}
              tone="red"
            />
            <StatCard
              label="Not spam"
              value={String(stats?.not_spam ?? 0)}
              tone="green"
            />
            <StatCard
              label="Recent accuracy"
              value={formatPercent(stats?.recentAccuracy)}
              sub={
                stats && stats.recentSampleSize > 0
                  ? `over last ${stats.recentSampleSize}`
                  : "not enough data"
              }
            />
          </>
        )}
      </div>

      {stats && Object.keys(stats.bySource).length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span className="uppercase tracking-wide">By source:</span>
          {Object.entries(stats.bySource).map(([source, count]) => (
            <span
              key={source}
              className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-0.5 text-zinc-300"
            >
              {source.replace(/_/g, " ")}: {count}
            </span>
          ))}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Recent classifications → confirm / correct */}
        <div className="min-w-0 space-y-3">
          <h2 className="text-lg font-semibold text-white">
            Recent classifications
          </h2>
          <p className="text-sm text-zinc-500">
            Confirm a verdict to reinforce it, or correct it to teach the
            opposite label.
          </p>
          {recent.length === 0 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-6 text-sm text-zinc-500">
              No classified mail yet.
            </div>
          ) : (
            recent.map((item) => {
              const predictedSpam = item.classification === "spam";
              const labeled = labeledIds[item.id];
              const isBusy = labelingId === item.id;
              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-zinc-200">
                        {item.subject || "(no subject)"}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-zinc-500">
                        {item.mailboxName || item.mailboxEmailAddress || ""}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {predictedSpam ? (
                        <Badge tone="red">
                          <ShieldAlert className="h-3 w-3" /> Spam
                        </Badge>
                      ) : (
                        <Badge tone="green">
                          <ShieldCheck className="h-3 w-3" /> Not spam
                        </Badge>
                      )}
                      {item.actionConfidence != null ? (
                        <span className="text-xs text-zinc-500">
                          {formatPercent(item.actionConfidence)}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {labeled ? (
                    <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300">
                      <Check className="h-3.5 w-3.5" />
                      Recorded as {labeled === "spam" ? "spam" : "not spam"}
                    </div>
                  ) : (
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          labelThread(item, predictedSpam ? "spam" : "not_spam")
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isBusy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        Confirm
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          labelThread(item, predictedSpam ? "not_spam" : "spam")
                        }
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                          predictedSpam
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
                            : "border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20",
                        )}
                      >
                        {predictedSpam ? (
                          <ShieldCheck className="h-3.5 w-3.5" />
                        ) : (
                          <ShieldAlert className="h-3.5 w-3.5" />
                        )}
                        {predictedSpam ? "Not spam" : "Spam"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Paste text → classify tester */}
        <div className="min-w-0 space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
          <div className="inline-flex items-center gap-2 text-sm font-medium text-white">
            <Sparkles className="h-4 w-4 text-[rgb(var(--theme-primary-rgb))]" />
            Classify tester
          </div>
          <p className="text-sm text-zinc-500">
            Paste an email (subject + body) to see how the current corpus would
            vote — and whether it clears the confidence threshold.
          </p>
          <textarea
            value={testerText}
            onChange={(event) => setTesterText(event.target.value)}
            placeholder="Subject: You've won a prize!&#10;Body: Click here to claim…"
            rows={7}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
          />
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={runClassify}
              disabled={isClassifying || !testerText.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-theme-gradient px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Wand2 className="h-4 w-4" />
              {isClassifying ? "Classifying…" : "Classify"}
            </button>
          </div>

          {verdictError ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {verdictError}
            </div>
          ) : null}

          {verdict ? (
            <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex items-center gap-2">
                  {verdict.label === "spam" ? (
                    <Badge tone="red">
                      <ShieldAlert className="h-3 w-3" /> Spam
                    </Badge>
                  ) : verdict.label === "not_spam" ? (
                    <Badge tone="green">
                      <ShieldCheck className="h-3 w-3" /> Not spam
                    </Badge>
                  ) : (
                    <Badge tone="zinc">No verdict</Badge>
                  )}
                  {verdict.label !== null ? (
                    verdict.confident ? (
                      <Badge tone="green">Confident</Badge>
                    ) : (
                      <Badge tone="zinc">Below threshold → backstop</Badge>
                    )
                  ) : null}
                </div>
                <span className="text-sm font-medium text-zinc-200">
                  {formatPercent(verdict.confidence)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-zinc-500">
                <div>
                  Threshold:{" "}
                  <span className="text-zinc-300">
                    {formatPercent(verdict.threshold)}
                  </span>
                </div>
                <div>
                  Neighbors voting:{" "}
                  <span className="text-zinc-300">{verdict.exampleCount}</span>
                </div>
              </div>
              {verdict.label === null ? (
                <p className="text-xs text-zinc-500">
                  Cold start — no signatures yet. Label some mail above and the
                  classifier begins to vote.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {statusMessage ? (
        <div className="text-sm text-zinc-400">{statusMessage}</div>
      ) : null}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "red" | "green";
}) {
  const valueTone =
    tone === "red"
      ? "text-red-300"
      : tone === "green"
        ? "text-emerald-300"
        : "text-white";
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className={cn("mt-1 text-2xl font-bold", valueTone)}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-zinc-500">{sub}</div> : null}
    </div>
  );
}
