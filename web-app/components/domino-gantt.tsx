"use client";

import { useMemo, type JSX } from "react";
import {
  addDays,
  differenceInCalendarDays,
  format,
  isValid,
  max as maxDate,
  parseISO,
  startOfDay,
} from "date-fns";
import { AlertTriangle, Gift } from "lucide-react";
import { cn } from "@/lib/utils";

export interface GanttStake {
  id: string;
  name: string | null;
  kind: "consequence" | "reward";
  triggerAt: string | null; // ISO date or null
  recurrence: string | null; // "weekly" | "monthly" | etc, or null
  recurrenceIntervalDays: number | null;
  effectiveWeight: number;
}

const MIN_SPAN_DAYS = 30;
const TICK_DAYS = 7;
const MAX_RECUR_TICKS = 52;

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = parseISO(value);
  return isValid(d) ? startOfDay(d) : null;
}

export function DominoGantt({
  stakes,
  selectedId,
  onSelect,
}: {
  stakes: GanttStake[];
  selectedId: string | null;
  onSelect?: (id: string) => void;
}): JSX.Element | null {
  const model = useMemo(() => {
    const today = startOfDay(new Date());

    const dated: Array<{ stake: GanttStake; date: Date }> = [];
    const undated: GanttStake[] = [];
    for (const stake of stakes) {
      const date = parseDate(stake.triggerAt);
      if (date) dated.push({ stake, date });
      else undated.push(stake);
    }

    dated.sort((a, b) => a.date.getTime() - b.date.getTime());

    // End of timeline: latest trigger date, clamped to at least MIN_SPAN_DAYS out.
    const latest = dated.length
      ? maxDate(dated.map((d) => d.date))
      : addDays(today, MIN_SPAN_DAYS);
    const end = maxDate([latest, addDays(today, MIN_SPAN_DAYS)]);
    const spanDays = Math.max(1, differenceInCalendarDays(end, today));

    const pct = (date: Date) =>
      Math.min(100, Math.max(0, (differenceInCalendarDays(date, today) / spanDays) * 100));

    // Weekly tick marks along the axis.
    const ticks: Array<{ date: Date; left: number }> = [];
    for (let day = 0; day <= spanDays; day += TICK_DAYS) {
      const date = addDays(today, day);
      ticks.push({ date, left: pct(date) });
    }

    return { today, dated, undated, end, spanDays, pct, ticks };
  }, [stakes]);

  if (!stakes.length) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-6 text-center text-sm text-zinc-500">
        No stakes to chart yet.
      </div>
    );
  }

  const { dated, undated, pct, ticks, today, end, spanDays } = model;

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/50">
      <div className="min-w-[640px]">
        {/* Axis header */}
        <div className="relative h-7 border-b border-zinc-800">
          <div className="absolute inset-y-0 left-44 right-4">
            <div className="relative h-full">
              {ticks.map((tick, i) => (
                <div
                  key={i}
                  className="absolute top-0 flex h-full -translate-x-1/2 items-center"
                  style={{ left: `${tick.left}%` }}
                >
                  <span className="whitespace-nowrap text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                    {format(tick.date, "MMM d")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Rows */}
        <div className="relative">
          {/* gridlines + today line span the full body */}
          <div className="pointer-events-none absolute inset-y-0 left-44 right-4">
            <div className="relative h-full">
              {ticks.map((tick, i) => (
                <div
                  key={i}
                  className="absolute inset-y-0 w-px bg-zinc-800/70"
                  style={{ left: `${tick.left}%` }}
                />
              ))}
              <div
                className="absolute inset-y-0 w-px bg-amber-400/70"
                style={{ left: `${pct(today)}%` }}
              >
                <span className="absolute -top-0 left-1 text-[9px] font-semibold uppercase text-amber-400/90">
                  Today
                </span>
              </div>
            </div>
          </div>

          {dated.map(({ stake, date }) => {
            const isConsequence = stake.kind === "consequence";
            const selected = stake.id === selectedId;
            const Icon = isConsequence ? AlertTriangle : Gift;
            const accent = isConsequence ? "text-amber-400" : "text-emerald-400";
            const markerBg = isConsequence ? "bg-amber-500" : "bg-emerald-500";
            const left = pct(date);

            // Optional recurrence ticks.
            const recurTicks: number[] = [];
            const step = stake.recurrenceIntervalDays;
            if (stake.recurrence && step && step > 0) {
              let cursor = addDays(date, step);
              let count = 0;
              while (cursor <= end && count < MAX_RECUR_TICKS) {
                recurTicks.push(pct(cursor));
                cursor = addDays(cursor, step);
                count += 1;
              }
            }

            return (
              <button
                type="button"
                key={stake.id}
                onClick={() => onSelect?.(stake.id)}
                className={cn(
                  "group relative flex h-11 w-full items-center border-b border-zinc-800/60 text-left transition-colors",
                  selected ? "bg-zinc-800/70" : "hover:bg-zinc-800/40",
                )}
              >
                {/* Label */}
                <div className="flex w-44 shrink-0 items-center gap-2 px-3">
                  <Icon className={cn("h-3.5 w-3.5 shrink-0", accent)} />
                  <span
                    className={cn(
                      "truncate text-xs",
                      selected ? "font-semibold text-zinc-100" : "text-zinc-300",
                    )}
                  >
                    {stake.name || "Untitled"}
                  </span>
                </div>

                {/* Track */}
                <div className="relative h-full flex-1 pr-4">
                  <div className="relative h-full">
                    {recurTicks.map((l, i) => (
                      <div
                        key={i}
                        className={cn(
                          "absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 opacity-40",
                          markerBg,
                        )}
                        style={{ left: `${l}%` }}
                      />
                    ))}
                    <div
                      className={cn(
                        "absolute top-1/2 flex h-7 -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full px-2 shadow-sm transition-all",
                        markerBg,
                        selected
                          ? "ring-2 ring-white/70 ring-offset-2 ring-offset-zinc-900"
                          : "opacity-90 group-hover:opacity-100",
                      )}
                      style={{ left: `${left}%` }}
                    >
                      <span className="whitespace-nowrap text-[10px] font-semibold text-zinc-950">
                        {format(date, "MMM d")}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}

          {dated.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-zinc-500">
              No stakes have a fall date yet.
            </div>
          )}
        </div>

        {/* Undated group */}
        {undated.length > 0 && (
          <div className="border-t border-zinc-800 bg-zinc-950/40">
            <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
              No fall date
            </div>
            {undated.map((stake) => {
              const isConsequence = stake.kind === "consequence";
              const selected = stake.id === selectedId;
              const Icon = isConsequence ? AlertTriangle : Gift;
              const accent = isConsequence ? "text-amber-400/70" : "text-emerald-400/70";
              return (
                <button
                  type="button"
                  key={stake.id}
                  onClick={() => onSelect?.(stake.id)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors",
                    selected ? "bg-zinc-800/70" : "hover:bg-zinc-800/40",
                  )}
                >
                  <Icon className={cn("h-3.5 w-3.5 shrink-0", accent)} />
                  <span
                    className={cn(
                      "truncate text-xs",
                      selected ? "font-semibold text-zinc-200" : "text-zinc-500",
                    )}
                  >
                    {stake.name || "Untitled"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {/* span hint for screen readers / debugging */}
      <span className="sr-only">{`Timeline spans ${spanDays} days`}</span>
    </div>
  );
}
