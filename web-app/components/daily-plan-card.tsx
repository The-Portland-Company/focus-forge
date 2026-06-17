"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Sparkles,
  RefreshCw,
  Play,
  Check,
  ChevronRight,
  Loader2,
  Inbox,
  ListChecks,
  HelpCircle,
  Bomb,
} from "lucide-react";
import { SnoozePopover } from "@/components/snooze-popover";
import { Tooltip } from "@/components/tooltip";
import { DominoBadge } from "@/components/domino-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  DailyPlanResponse,
  DailyPlanOrderedItem,
  DominoTaskSummary,
} from "@/lib/daily-plan/types";

/**
 * Read the optional compact domino summary off an ordered plan item. The
 * daily-plan API may attach a `domino` object (see DominoTaskSummary) in
 * addition to dominoScore/dominoRationale; we treat the whole thing as
 * optional and unknown-shaped, returning null when absent.
 */
function getItemDomino(
  item: DailyPlanOrderedItem | null | undefined,
): DominoTaskSummary | null {
  if (!item) return null;
  const d = (item as { domino?: unknown }).domino;
  if (!d || typeof d !== "object") return null;
  return d as DominoTaskSummary;
}

export interface DailyPlanCardItemContext {
  task?: {
    id: string;
    name: string;
    projectName?: string | null;
  };
  inboxItem?: {
    id: string;
    actionTitle: string;
    subject?: string | null;
  };
}

interface DailyPlanCardProps {
  capacityMinutes: number;
  plannedMinutesActual: number; // sum of timeEstimate of tasks due today, computed by parent
  resolveContext: (item: { kind: "task" | "inbox_item"; id: string }) =>
    | DailyPlanCardItemContext
    | null;
  onStartTask: (taskId: string) => void;
  onCompleteTask: (taskId: string) => void;
  onSnoozeTask: (taskId: string, snoozedUntilIso: string) => void;
  onSnoozeInboxItem: (inboxItemId: string, snoozedUntilIso: string) => void;
  onConvertInboxToTask: (inboxItemId: string) => void;
  /**
   * Called whenever a plan is loaded (fresh fetch or cache rehydrate) with the
   * per-task domino summary + rationale maps, so the parent can surface domino
   * badges on the Today / Next Up task rows. Optional.
   */
  onPlanLoaded?: (maps: {
    dominoByTaskId: Record<string, DominoTaskSummary>;
    dominoRationaleByTaskId: Record<string, string>;
  }) => void;
}

/** Extract per-task domino + rationale maps from a plan's ordered items. */
function extractDominoMaps(plan: DailyPlanResponse | null): {
  dominoByTaskId: Record<string, DominoTaskSummary>;
  dominoRationaleByTaskId: Record<string, string>;
} {
  const dominoByTaskId: Record<string, DominoTaskSummary> = {};
  const dominoRationaleByTaskId: Record<string, string> = {};
  for (const item of plan?.orderedItems ?? []) {
    if (item.kind !== "task") continue;
    const domino = getItemDomino(item);
    if (domino) dominoByTaskId[item.id] = domino;
    if (item.dominoRationale) dominoRationaleByTaskId[item.id] = item.dominoRationale;
  }
  return { dominoByTaskId, dominoRationaleByTaskId };
}

function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function DailyPlanCard({
  capacityMinutes,
  plannedMinutesActual,
  resolveContext,
  onStartTask,
  onCompleteTask,
  onSnoozeTask,
  onSnoozeInboxItem,
  onConvertInboxToTask,
  onPlanLoaded,
}: DailyPlanCardProps) {
  const [plan, setPlan] = useState<DailyPlanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showHelp, setShowHelp] = useState(false);

  // Cache the day's generated plan so navigating away + back doesn't burn AI
  // usage by re-running. Keyed on today's local date.
  const todayKey = useMemo(() => {
    const d = new Date();
    return `dailyPlan:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const fetchPlan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/daily-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(
          errorPayload?.error || `Daily plan failed (${response.status})`,
        );
      }
      const payload = (await response.json()) as DailyPlanResponse;
      setPlan(payload);
      setCurrentIndex(0);
      try {
        localStorage.setItem(todayKey, JSON.stringify(payload));
      } catch {
        /* quota / private mode */
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load plan");
    } finally {
      setLoading(false);
    }
  }, [todayKey]);

  // On mount: rehydrate today's cached plan if present. Do NOT auto-fetch —
  // generation is gated behind an explicit "Generate plan" click to avoid
  // burning AI usage on every Today view visit.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(todayKey);
      if (raw) setPlan(JSON.parse(raw) as DailyPlanResponse);
    } catch {
      /* ignore */
    }
  }, [todayKey]);

  // Surface per-task domino maps to the parent whenever the plan changes, so
  // the Today / Next Up task rows can render matching domino badges.
  useEffect(() => {
    if (!onPlanLoaded) return;
    onPlanLoaded(extractDominoMaps(plan));
  }, [plan, onPlanLoaded]);

  const replan = useCallback(() => {
    try {
      localStorage.removeItem(todayKey);
    } catch {
      /* ignore */
    }
    void fetchPlan();
  }, [fetchPlan, todayKey]);

  // When the planner errors with a provider billing/quota issue, surface a
  // direct link to that provider's billing page.
  const billingProvider = useMemo(() => {
    const msg = (error || "").toLowerCase();
    if (!msg) return null;
    if (/insufficient_quota|exceeded your current quota|openai|gpt-|whisper-/.test(msg)) {
      return { label: "OpenAI", url: "https://platform.openai.com/settings/organization/billing/overview" };
    }
    if (/credit balance|anthropic|claude/.test(msg)) {
      return { label: "Anthropic", url: "https://console.anthropic.com/settings/billing" };
    }
    if (/spending limit|xai|grok-|groq/.test(msg)) {
      return { label: "xAI", url: "https://console.x.ai/" };
    }
    return null;
  }, [error]);

  const orderedItems = plan?.orderedItems || [];
  const currentItem = orderedItems[currentIndex] || null;
  const currentContext = currentItem
    ? resolveContext({ kind: currentItem.kind, id: currentItem.id })
    : null;

  const advance = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, orderedItems.length));
  }, [orderedItems.length]);

  const capacityRatio = useMemo(() => {
    if (!capacityMinutes) return 0;
    return Math.min(2, plannedMinutesActual / capacityMinutes);
  }, [capacityMinutes, plannedMinutesActual]);

  const capacityColorClass =
    capacityRatio > 1
      ? "bg-red-500"
      : capacityRatio > 0.8
        ? "bg-amber-400"
        : "bg-emerald-500";

  // --- Daily Domino Briefing ------------------------------------------------
  // Summarize the dominoes that fall soonest across the plan + the user's free
  // capacity. All domino data is optional; the briefing is hidden when none of
  // the planned tasks carry domino summaries.
  const briefing = useMemo(() => {
    const dominoes: { id: string; domino: DominoTaskSummary }[] = [];
    for (const item of orderedItems) {
      if (item.kind !== "task") continue;
      const domino = getItemDomino(item);
      if (domino) dominoes.push({ id: item.id, domino });
    }
    if (dominoes.length === 0) return null;

    // Total $ at stake = largest dollar magnitude per task, summed.
    let totalDollars = 0;
    let nearest: string | null = null;
    for (const { domino } of dominoes) {
      let taskMax = 0;
      for (const s of domino.stakes ?? []) {
        const d = Number(s?.dollarEquivalent);
        if (Number.isFinite(d) && Math.abs(d) > taskMax) taskMax = Math.abs(d);
      }
      totalDollars += taskMax;
      const t = domino.nearestTriggerAt;
      if (t && (!nearest || new Date(t).getTime() < new Date(nearest).getTime())) {
        nearest = t;
      }
    }

    const freeHours = Math.max(0, capacityMinutes) / 60;
    return {
      count: dominoes.length,
      totalDollars,
      nearest,
      freeHours,
    };
  }, [orderedItems, capacityMinutes]);

  const formatBriefingDollars = (value: number): string => {
    if (!Number.isFinite(value) || value <= 0) return "$0";
    if (value >= 1000) {
      const k = value / 1000;
      return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
    }
    return `$${Math.round(value)}`;
  };

  const formatFreeHours = (hours: number): string => {
    if (!Number.isFinite(hours) || hours <= 0) return "0h";
    return hours % 1 === 0 ? `${hours}h` : `${hours.toFixed(1)}h`;
  };

  const formatBriefingCountdown = (triggerAt: string): string => {
    const ms = new Date(triggerAt).getTime();
    if (!Number.isFinite(ms)) return "soon";
    const delta = ms - Date.now();
    const abs = Math.abs(delta);
    const days = Math.floor(abs / (24 * 60 * 60 * 1000));
    const hours = Math.floor((abs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const span = days >= 1 ? `${days}d` : `${Math.max(1, hours)}h`;
    return delta <= 0 ? `${span} overdue` : `in ${span}`;
  };

  const renderCurrentBody = () => {
    if (!currentItem) {
      return (
        <div className="flex items-center gap-3 text-sm text-zinc-400">
          <Sparkles className="h-4 w-4 text-emerald-400" />
          You&apos;re through the planned list. Nice work.
        </div>
      );
    }

    const titleNode =
      currentItem.kind === "task" ? (
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-theme-primary" />
          <span className="text-base font-medium text-white">
            {currentContext?.task?.name || "Task"}
          </span>
          {currentContext?.task?.projectName ? (
            <span className="text-xs text-zinc-500">
              · {currentContext.task.projectName}
            </span>
          ) : null}
          <DominoBadge
            domino={getItemDomino(currentItem)}
            rationale={currentItem.dominoRationale}
            className="shrink-0"
          />
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-sky-400" />
          <span className="text-base font-medium text-white">
            {currentContext?.inboxItem?.actionTitle || "Triage email"}
          </span>
          {currentContext?.inboxItem?.subject ? (
            <span className="text-xs text-zinc-500">
              · {currentContext.inboxItem.subject}
            </span>
          ) : null}
        </div>
      );

    return (
      <div className="space-y-3">
        {titleNode}
        <div className="text-xs text-zinc-400">
          <span className="font-medium text-zinc-300">
            ≈{formatMinutes(currentItem.estimateMinutes)}
          </span>
          {" — "}
          {currentItem.rationale}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {currentItem.kind === "task" ? (
            <>
              <button
                type="button"
                onClick={() => onStartTask(currentItem.id)}
                className="inline-flex items-center gap-1 rounded-md bg-theme-gradient px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
              >
                <Play className="h-3.5 w-3.5" /> Start
              </button>
              <button
                type="button"
                onClick={() => {
                  onCompleteTask(currentItem.id);
                  advance();
                }}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:border-zinc-500"
              >
                <Check className="h-3.5 w-3.5" /> Done
              </button>
              <SnoozePopover
                onSelect={(iso) => {
                  onSnoozeTask(currentItem.id, iso);
                  advance();
                }}
                trigger={
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:border-zinc-500"
                  >
                    Snooze
                  </button>
                }
              />
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  onConvertInboxToTask(currentItem.id);
                  advance();
                }}
                className="inline-flex items-center gap-1 rounded-md bg-theme-gradient px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
              >
                Convert to task
              </button>
              <SnoozePopover
                onSelect={(iso) => {
                  onSnoozeInboxItem(currentItem.id, iso);
                  advance();
                }}
                trigger={
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:border-zinc-500"
                  >
                    Snooze
                  </button>
                }
              />
            </>
          )}
          <button
            type="button"
            onClick={advance}
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-transparent px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200"
          >
            Skip <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-theme-primary" />
          <span className="text-sm font-semibold uppercase tracking-wide text-zinc-300">
            What&apos;s next?
          </span>
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" />
          ) : null}
        </div>
        {plan ? (
          <button
            type="button"
            onClick={replan}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-950/40 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className="h-3 w-3" /> Replan
          </button>
        ) : null}
      </div>

      {plan && briefing ? (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-300">
            <Bomb className="h-3.5 w-3.5" />
            Daily Domino Briefing
          </div>
          <p className="mt-1 text-xs text-zinc-300">
            {briefing.count} domino{briefing.count === 1 ? "" : "es"} fall soon
            {briefing.totalDollars > 0
              ? ` (${formatBriefingDollars(briefing.totalDollars)} at stake)`
              : ""}
            {briefing.nearest
              ? `, soonest ${formatBriefingCountdown(briefing.nearest)}`
              : ""}
            . With your {formatFreeHours(briefing.freeHours)} free, here&apos;s the
            optimal set.
          </p>
        </div>
      ) : null}

      <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
        {error ? (
          <div className="space-y-2">
            <div className="text-sm text-red-400">{error}</div>
            {billingProvider ? (
              <a
                href={billingProvider.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-200 hover:bg-amber-500/20"
              >
                Open {billingProvider.label} billing →
              </a>
            ) : null}
            <button
              type="button"
              onClick={fetchPlan}
              className="ml-2 inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-950/40 px-2.5 py-1 text-xs text-zinc-300 hover:border-zinc-600"
            >
              <RefreshCw className="h-3 w-3" /> Try again
            </button>
          </div>
        ) : loading && !plan ? (
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Building today&apos;s
            plan…
          </div>
        ) : !plan ? (
          <div className="group relative">
            <button
              type="button"
              onClick={() => setShowHelp(true)}
              aria-label="What does Generate plan do?"
              className="absolute -right-1 -top-1 z-10 rounded-full p-1 text-zinc-500 opacity-0 transition-opacity hover:text-zinc-200 focus:opacity-100 group-hover:opacity-100"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-3 pr-6">
              <p className="flex-1 text-sm text-zinc-400">
                Generate today&apos;s plan when you&apos;re ready — runs the AI, so
                it&apos;s one click instead of automatic.
              </p>
              <Tooltip content="Generate plan" side="top" align="end" className="shrink-0">
                <button
                  type="button"
                  onClick={fetchPlan}
                  disabled={loading}
                  aria-label="Generate plan"
                  className="inline-flex items-center justify-center rounded-md bg-theme-gradient p-2 text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Sparkles className="h-4 w-4" />
                </button>
              </Tooltip>
            </div>
          </div>
        ) : (
          renderCurrentBody()
        )}
      </div>

      <div className="mt-3 space-y-1.5">
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span>
            Planned <span className="text-zinc-200">{formatMinutes(plannedMinutesActual)}</span>
            {" / "}
            Capacity{" "}
            <span className="text-zinc-200">{formatMinutes(capacityMinutes)}</span>
          </span>
          {capacityRatio > 1 ? (
            <span className="text-red-400">Overcommitted</span>
          ) : capacityRatio > 0.8 ? (
            <span className="text-amber-300">Tight</span>
          ) : (
            <span className="text-emerald-400">On track</span>
          )}
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
          <div
            className={`h-full transition-all duration-300 ${capacityColorClass}`}
            style={{
              width: `${Math.min(100, Math.max(2, Math.round((capacityRatio || 0) * 100)))}%`,
            }}
          />
        </div>
      </div>

      {plan && plan.deferred.length > 0 ? (
        <div className="mt-3 text-xs text-zinc-500">
          {plan.deferred.length} item
          {plan.deferred.length === 1 ? "" : "s"} deferred to a later day.
        </div>
      ) : null}

      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent className="max-w-lg border-zinc-800 bg-zinc-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-theme-primary" />
              How Generate plan works
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Generate plan sends your eligible work to an AI planner (OpenAI
              GPT-4.1) that orders your day, estimates each item, and defers what
              won&apos;t fit. It runs only when you click — nothing is generated
              automatically — and the result is cached locally for the rest of the
              day. Use Replan to discard the cache and run it again.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-sm text-zinc-300">
            <div>
              <p className="mb-1 font-medium text-zinc-200">What it includes</p>
              <ul className="list-disc space-y-1 pl-5 text-zinc-400">
                <li>
                  Incomplete tasks due overdue, today, tomorrow, or later this
                  week — snoozed tasks are skipped (up to 60 tasks).
                </li>
                <li>
                  Email inbox items eligible for Today, treated as quick triage
                  (up to 30).
                </li>
                <li>Calendar time blocks scheduled for the day.</li>
                <li>
                  Your daily focus capacity from your profile (default 5h / 300
                  minutes).
                </li>
                <li>Pinned tasks, which are ranked to be done soon.</li>
              </ul>
            </div>

            <div>
              <p className="mb-1 font-medium text-zinc-200">How it ranks work</p>
              <ul className="list-disc space-y-1 pl-5 text-zinc-400">
                <li>
                  Higher priority, deadline pressure, overdue status, and tasks
                  blocking other work all rank earlier.
                </li>
                <li>
                  Each item gets a time estimate (your saved estimate when set,
                  otherwise a proposed one) and a one-line rationale.
                </li>
                <li>
                  Items that overflow your capacity are deferred with a suggested
                  snooze time when they aren&apos;t deadline-critical.
                </li>
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
