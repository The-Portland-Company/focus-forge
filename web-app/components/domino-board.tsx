"use client";

// Domino Effect — Phase 5 board view.
// Lists active stakes with their fall date, effective weight, and resolver
// tasks, and visualizes stake → stake chains as a simple indented adjacency
// list (v1 — no graph layout lib). Fetches GET /api/domino/board.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bomb, Loader2, RefreshCw, Gift, AlertTriangle, Wrench, HelpCircle } from "lucide-react";
import {
  DOMINO_BOARD_INTRO,
  DOMINO_BOARD_POINTS,
  DOMINO_BOARD_GET_STARTED,
  STAKE_EXAMPLES,
} from "@/lib/domino/help";

// Shared explainer rendered in the header "?" popover and the empty state.
function DominoHelpContent() {
  return (
    <div className="space-y-3 text-sm text-zinc-300">
      <p>{DOMINO_BOARD_INTRO}</p>

      {/* Mini cascade illustration (no screenshot needed). */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {["Pay storage unit", "Keep access", "Avoid $40/wk fee"].map(
          (node, index) => (
            <span key={node} className="flex items-center gap-2">
              <span className="rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-amber-200">
                {node}
              </span>
              {index < 2 ? <span className="text-zinc-500">→</span> : null}
            </span>
          ),
        )}
      </div>

      <dl className="space-y-1.5">
        {DOMINO_BOARD_POINTS.map((point) => (
          <div key={point.term} className="flex gap-2">
            <dt className="shrink-0 font-medium text-amber-200">
              {point.term}:
            </dt>
            <dd className="text-zinc-400">{point.detail}</dd>
          </div>
        ))}
      </dl>

      <div>
        <div className="mb-1 font-medium text-zinc-200">Examples</div>
        <ul className="space-y-1.5">
          {STAKE_EXAMPLES.map((example) => (
            <li key={example.label} className="flex gap-2 text-zinc-400">
              <span aria-hidden>{example.emoji}</span>
              <span>
                <span className="font-medium text-zinc-300">
                  {example.label}:
                </span>{" "}
                {example.text}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-zinc-400">{DOMINO_BOARD_GET_STARTED}</p>
    </div>
  );
}

interface BoardResolver {
  taskId: string;
  resolutionType: string;
}

interface BoardStake {
  id: string;
  name: string | null;
  kind: "consequence" | "reward";
  description?: string | null;
  monetaryValue?: number | null;
  severity?: string | null;
  triggerAt?: string | null;
  recurrence?: string | null;
  recurrenceIntervalDays?: number | null;
  status?: string | null;
  effectiveWeight: number;
  resolvers: BoardResolver[];
}

interface BoardEdge {
  parentStakeId: string;
  childStakeId: string;
  weightMultiplier?: number | null;
}

interface BoardResponse {
  stakes: BoardStake[];
  edges: BoardEdge[];
}

function formatDollars(value: number | null | undefined): string {
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0) return "$0";
  if (v >= 1000) {
    const k = v / 1000;
    return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return `$${Math.round(v)}`;
}

function formatFallDate(triggerAt: string | null | undefined): string {
  if (!triggerAt) return "No fall date";
  const ms = new Date(triggerAt).getTime();
  if (!Number.isFinite(ms)) return "No fall date";
  const delta = ms - Date.now();
  const abs = Math.abs(delta);
  const days = Math.floor(abs / (24 * 60 * 60 * 1000));
  const when = new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  if (delta <= 0) return `${when} · ${days}d overdue`;
  return `${when} · in ${days}d`;
}

export function DominoBoard() {
  const [data, setData] = useState<BoardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/domino/board");
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || `Failed to load board (${res.status})`);
      }
      setData((await res.json()) as BoardResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load board");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stakeById = useMemo(() => {
    const m = new Map<string, BoardStake>();
    for (const s of data?.stakes ?? []) m.set(s.id, s);
    return m;
  }, [data]);

  // Adjacency: parent → child ids, and the set of child ids (to find roots).
  const { childrenByParent, childIds } = useMemo(() => {
    const childrenByParent = new Map<string, string[]>();
    const childIds = new Set<string>();
    for (const e of data?.edges ?? []) {
      const list = childrenByParent.get(e.parentStakeId) ?? [];
      list.push(e.childStakeId);
      childrenByParent.set(e.parentStakeId, list);
      childIds.add(e.childStakeId);
    }
    return { childrenByParent, childIds };
  }, [data]);

  // Roots = stakes that are not a child of any edge. These anchor each chain.
  const roots = useMemo(
    () => (data?.stakes ?? []).filter((s) => !childIds.has(s.id)),
    [data, childIds],
  );

  const renderStakeRow = (stake: BoardStake, depth: number, seen: Set<string>) => {
    // Guard against cycles in display: stop recursing once a stake repeats.
    const cyclic = seen.has(stake.id);
    const nextSeen = new Set(seen);
    nextSeen.add(stake.id);
    const children = cyclic ? [] : childrenByParent.get(stake.id) ?? [];
    const isReward = stake.kind === "reward";

    return (
      <div key={`${stake.id}-${depth}`}>
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2"
          style={{ marginLeft: depth * 20 }}
        >
          {isReward ? (
            <Gift className="h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
          )}
          <span className="text-sm font-medium text-white">
            {stake.name || "Untitled stake"}
          </span>
          <span
            className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none ${
              isReward
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border-amber-500/40 bg-amber-500/10 text-amber-200"
            }`}
          >
            {isReward ? "reward" : "consequence"}
          </span>
          <span className="text-xs text-zinc-400">
            weight {formatDollars(stake.effectiveWeight)}
          </span>
          <span className="text-xs text-zinc-500">
            · {formatFallDate(stake.triggerAt)}
          </span>
          {stake.recurrence ? (
            <span className="text-xs text-zinc-500">· {stake.recurrence}</span>
          ) : null}
          {stake.resolvers.length > 0 ? (
            <span className="inline-flex items-center gap-1 text-xs text-sky-300">
              <Wrench className="h-3 w-3" />
              {stake.resolvers.length} resolver
              {stake.resolvers.length === 1 ? "" : "s"}
              {stake.resolvers.some((r) => r.resolutionType === "eliminates")
                ? " (eliminates)"
                : ""}
            </span>
          ) : (
            <span className="text-xs text-zinc-600">· no resolver</span>
          )}
          {cyclic ? (
            <span className="text-[10px] text-red-400">↻ cycle</span>
          ) : null}
        </div>
        {children.map((childId) => {
          const child = stakeById.get(childId);
          if (!child) return null;
          return renderStakeRow(child, depth + 1, nextSeen);
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bomb className="h-5 w-5 text-amber-400" />
          <h1 className="text-lg font-semibold text-white">Domino Board</h1>
          <button
            type="button"
            onClick={() => setShowHelp((current) => !current)}
            aria-label="How the Domino Board works"
            aria-expanded={showHelp}
            className={`inline-flex h-6 w-6 items-center justify-center rounded-full border transition-colors ${
              showHelp
                ? "border-amber-400/60 bg-amber-400/10 text-amber-300"
                : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
            }`}
          >
            <HelpCircle className="h-4 w-4" />
          </button>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-950/40 px-2.5 py-1 text-xs text-zinc-300 hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      {showHelp ? (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-4">
          <div className="mb-2 flex items-center gap-2 font-medium text-amber-200">
            <HelpCircle className="h-4 w-4" /> How the Domino Board works
          </div>
          <DominoHelpContent />
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {!error && !loading && (data?.stakes.length ?? 0) === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <p className="text-center text-sm font-medium text-zinc-300">
            No active stakes yet. Add stakes to a task to see your dominoes here.
          </p>
          <div className="mx-auto mt-4 max-w-xl">
            <DominoHelpContent />
          </div>
        </div>
      ) : null}

      {roots.length > 0 ? (
        <div className="space-y-2">
          {roots.map((root) => renderStakeRow(root, 0, new Set<string>()))}
        </div>
      ) : null}
    </div>
  );
}
