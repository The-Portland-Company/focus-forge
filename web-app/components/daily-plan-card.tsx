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
} from "lucide-react";
import { SnoozePopover } from "@/components/snooze-popover";
import type { DailyPlanResponse } from "@/lib/daily-plan/types";

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
}: DailyPlanCardProps) {
  const [plan, setPlan] = useState<DailyPlanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load plan");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
                className="inline-flex items-center gap-1 rounded-md bg-theme-primary px-3 py-1.5 text-sm font-medium text-zinc-950 hover:opacity-90"
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
                className="inline-flex items-center gap-1 rounded-md bg-theme-primary px-3 py-1.5 text-sm font-medium text-zinc-950 hover:opacity-90"
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
        <button
          type="button"
          onClick={fetchPlan}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-950/40 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className="h-3 w-3" /> Replan
        </button>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
        {error ? (
          <div className="text-sm text-red-400">{error}</div>
        ) : loading && !plan ? (
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Building today&apos;s
            plan…
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
    </div>
  );
}
