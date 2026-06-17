"use client";

// Domino Effect — Phase 5 UI.
// Urgency-colored chip showing the $-equivalent at stake plus a countdown to
// the nearest trigger_at. Color ramps with urgency (far = neutral, near /
// overdue = hot), mirroring the URGENCY ramp in lib/domino/scoring.ts. The
// optional AI rationale is surfaced via tooltip + title/aria for accessibility.

import { useEffect, useState } from "react";
import { Bomb } from "lucide-react";
import { Tooltip } from "@/components/tooltip";
import { URGENCY } from "@/lib/domino/constants";
import type { DominoTaskSummary } from "@/lib/daily-plan/types";

interface DominoBadgeProps {
  /** Compact domino summary as attached to a plan/task item (optional). */
  domino?: DominoTaskSummary | null;
  /** AI rationale to surface on hover/focus (optional). */
  rationale?: string | null;
  className?: string;
}

const RAMP_MS = URGENCY.rampDays * 24 * 60 * 60 * 1000;

/** Largest dollar magnitude across the summary's stakes (defaults to 0). */
function maxDollarEquivalent(domino: DominoTaskSummary): number {
  let max = 0;
  for (const s of domino.stakes ?? []) {
    const d = Number(s?.dollarEquivalent);
    if (Number.isFinite(d) && Math.abs(d) > max) max = Math.abs(d);
  }
  return max;
}

function formatDollars(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "$0";
  if (value >= 1000) {
    const k = value / 1000;
    return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return `$${Math.round(value)}`;
}

/** Human countdown to (or since) the trigger instant. */
function formatCountdown(triggerAt: string | null | undefined, now: number): {
  label: string;
  overdue: boolean;
} | null {
  if (!triggerAt) return null;
  const ms = new Date(triggerAt).getTime();
  if (!Number.isFinite(ms)) return null;
  const delta = ms - now;
  const overdue = delta <= 0;
  const abs = Math.abs(delta);
  const days = Math.floor(abs / (24 * 60 * 60 * 1000));
  const hours = Math.floor((abs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  let span: string;
  if (days >= 1) span = `${days}d`;
  else if (hours >= 1) span = `${hours}h`;
  else span = `${Math.max(1, Math.floor(abs / (60 * 1000)))}m`;
  return { label: overdue ? `${span} overdue` : `in ${span}`, overdue };
}

/** 0 (far) → 1 (at/past trigger), matching the scoring urgency ramp window. */
function urgencyProgress(
  triggerAt: string | null | undefined,
  now: number,
): number {
  if (!triggerAt) return 0;
  const ms = new Date(triggerAt).getTime();
  if (!Number.isFinite(ms)) return 0;
  const until = ms - now;
  if (until <= 0) return 1;
  if (until >= RAMP_MS) return 0;
  return 1 - until / RAMP_MS;
}

// Color tiers ramp from neutral (zinc) → warm (amber) → hot (red). Each entry
// keeps light + dark legibility via the app's standard /10 surface tints.
function colorClasses(progress: number, overdue: boolean): string {
  if (overdue || progress >= 0.85)
    return "border-red-500/40 bg-red-500/10 text-red-300";
  if (progress >= 0.5)
    return "border-orange-500/40 bg-orange-500/10 text-orange-300";
  if (progress > 0)
    return "border-amber-400/40 bg-amber-400/10 text-amber-200";
  return "border-zinc-700 bg-zinc-800/60 text-zinc-300";
}

export function DominoBadge({ domino, rationale, className }: DominoBadgeProps) {
  // Re-evaluate the countdown roughly once a minute so it stays live without a
  // heavy timer. Safe to run on every mounted badge (cheap interval).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Defensive: render nothing when there is no domino data at all.
  if (!domino) return null;
  const dollars = maxDollarEquivalent(domino);
  const countdown = formatCountdown(domino.nearestTriggerAt, now);
  if (dollars <= 0 && !countdown) return null;

  const progress = urgencyProgress(domino.nearestTriggerAt, now);
  const overdue = countdown?.overdue ?? false;

  const ariaParts: string[] = ["Domino"];
  if (dollars > 0) ariaParts.push(`${formatDollars(dollars)} at stake`);
  if (countdown) ariaParts.push(countdown.label);
  const ariaLabel = ariaParts.join(", ");

  const tooltipText =
    (rationale && rationale.trim()) ||
    (domino.topStakeSummary && domino.topStakeSummary.trim()) ||
    ariaLabel;

  const chip = (
    <span
      role="status"
      aria-label={ariaLabel}
      title={tooltipText}
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none ${colorClasses(
        progress,
        overdue,
      )} ${className ?? ""}`}
    >
      <Bomb className="h-3 w-3 shrink-0" aria-hidden="true" />
      {dollars > 0 ? <span>{formatDollars(dollars)}</span> : null}
      {countdown ? (
        <span className="opacity-80">· {countdown.label}</span>
      ) : null}
    </span>
  );

  // Only wrap in the (heavier) tooltip primitive when there's extra context to
  // show beyond the always-present native title attribute.
  if (tooltipText && tooltipText !== ariaLabel) {
    return (
      <Tooltip content={tooltipText} side="top" className="inline-flex shrink-0">
        {chip}
      </Tooltip>
    );
  }
  return chip;
}
