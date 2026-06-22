"use client";

// Domino Effect — Phase 5 board view.
// Lists active stakes with their fall date, effective weight, and resolver
// tasks, and visualizes stake → stake chains as a collapsible indented
// adjacency list. A Gantt timeline sits on top, a search/filter bar scopes the
// list, and each stake can be edited or deleted inline. Fetches
// GET /api/domino/board.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bomb,
  Loader2,
  RefreshCw,
  Gift,
  AlertTriangle,
  Wrench,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  Check,
  X,
} from "lucide-react";
import {
  DOMINO_BOARD_INTRO,
  DOMINO_BOARD_POINTS,
  DOMINO_BOARD_GET_STARTED,
  STAKE_EXAMPLES,
} from "@/lib/domino/help";
import { Tooltip } from "@/components/tooltip";
import { DominoGantt, type GanttStake } from "@/components/domino-gantt";
import {
  DominoFilterBar,
  filterStakes,
  defaultDominoFilterState,
  type DominoFilterState,
  type FilterStake,
} from "@/components/domino-filters";

// Shared, hover-tooltip explainer copy for the key board terms + their defaults.
const HELP_RESOLVER =
  "A task that keeps this domino standing. Resolution type defaults: “Defuses once” handles a single instance; “Eliminates” clears a recurring stake for good.";
const HELP_WEIGHT =
  "Effective $ at stake — this stake's own value plus a share of every chained child (0.7× per hop down the chain).";
const HELP_FALL_DATE =
  "When the stake comes due. Urgency rises as the date nears; once it passes, the domino falls.";

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
  taskName?: string | null;
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

// ISO trigger_at → value for a <input type="date">  (YYYY-MM-DD), local-ish.
function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

interface EditDraft {
  name: string;
  kind: "consequence" | "reward";
  monetaryValue: string;
  fallDate: string; // YYYY-MM-DD or ""
}

export function DominoBoard() {
  const [data, setData] = useState<BoardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const [filter, setFilter] = useState<DominoFilterState>(
    defaultDominoFilterState(),
  );
  const [selectedStakeId, setSelectedStakeId] = useState<string | null>(null);

  // Collapsed accordion parents (default = expanded, so absence means open).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Inline edit / delete state.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

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

  // Apply the search/filter bar to the raw stakes before anything is built.
  const filteredStakes = useMemo(() => {
    const all = data?.stakes ?? [];
    const asFilter: (BoardStake & FilterStake)[] = all.map((s) => ({
      ...s,
      triggerAt: s.triggerAt ?? null,
      status: s.status ?? "active",
    }));
    return filterStakes(asFilter, filter) as BoardStake[];
  }, [data, filter]);

  const stakeById = useMemo(() => {
    const m = new Map<string, BoardStake>();
    for (const s of filteredStakes) m.set(s.id, s);
    return m;
  }, [filteredStakes]);

  // Adjacency over the filtered set only (drop edges whose endpoints were
  // filtered out so the tree stays consistent with what's shown).
  const { childrenByParent, childIds } = useMemo(() => {
    const childrenByParent = new Map<string, string[]>();
    const childIds = new Set<string>();
    for (const e of data?.edges ?? []) {
      if (!stakeById.has(e.parentStakeId) || !stakeById.has(e.childStakeId))
        continue;
      const list = childrenByParent.get(e.parentStakeId) ?? [];
      list.push(e.childStakeId);
      childrenByParent.set(e.parentStakeId, list);
      childIds.add(e.childStakeId);
    }
    return { childrenByParent, childIds };
  }, [data, stakeById]);

  // Roots = stakes that are not a child of any (filtered) edge.
  const roots = useMemo(
    () => filteredStakes.filter((s) => !childIds.has(s.id)),
    [filteredStakes, childIds],
  );

  const ganttStakes = useMemo<GanttStake[]>(
    () =>
      filteredStakes.map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.kind,
        triggerAt: s.triggerAt ?? null,
        recurrence: s.recurrence ?? null,
        recurrenceIntervalDays: s.recurrenceIntervalDays ?? null,
        effectiveWeight: s.effectiveWeight,
      })),
    [filteredStakes],
  );

  const toggleCollapsed = (id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const beginEdit = (stake: BoardStake) => {
    setRowError(null);
    setConfirmDeleteId(null);
    setEditingId(stake.id);
    setDraft({
      name: stake.name ?? "",
      kind: stake.kind,
      monetaryValue:
        stake.monetaryValue != null ? String(stake.monetaryValue) : "",
      fallDate: isoToDateInput(stake.triggerAt),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
    setRowError(null);
  };

  const saveEdit = async (stakeId: string) => {
    if (!draft) return;
    setSavingId(stakeId);
    setRowError(null);

    const monetary =
      draft.monetaryValue.trim() === ""
        ? null
        : Number(draft.monetaryValue);
    const triggerAt =
      draft.fallDate.trim() === ""
        ? null
        : new Date(`${draft.fallDate}T00:00:00`).toISOString();

    const body = {
      name: draft.name.trim() || null,
      kind: draft.kind,
      monetary_value: Number.isFinite(monetary as number) ? monetary : null,
      trigger_at: triggerAt,
    };

    try {
      const res = await fetch(`/api/stakes/${stakeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || `Failed to save (${res.status})`);
      }
      // Optimistically merge into local state (no full refetch).
      setData((current) => {
        if (!current) return current;
        return {
          ...current,
          stakes: current.stakes.map((s) =>
            s.id === stakeId
              ? {
                  ...s,
                  name: body.name,
                  kind: body.kind,
                  monetaryValue: body.monetary_value,
                  triggerAt: body.trigger_at,
                }
              : s,
          ),
        };
      });
      cancelEdit();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingId(null);
    }
  };

  const confirmDelete = async (stakeId: string) => {
    setDeletingId(stakeId);
    setRowError(null);
    try {
      const res = await fetch(`/api/stakes/${stakeId}`, { method: "DELETE" });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || `Failed to delete (${res.status})`);
      }
      // Remove the stake and any edges touching it from local state.
      setData((current) => {
        if (!current) return current;
        return {
          stakes: current.stakes.filter((s) => s.id !== stakeId),
          edges: current.edges.filter(
            (e) =>
              e.parentStakeId !== stakeId && e.childStakeId !== stakeId,
          ),
        };
      });
      if (selectedStakeId === stakeId) setSelectedStakeId(null);
      setConfirmDeleteId(null);
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  };

  const renderStakeRow = (
    stake: BoardStake,
    depth: number,
    seen: Set<string>,
  ) => {
    const cyclic = seen.has(stake.id);
    const nextSeen = new Set(seen);
    nextSeen.add(stake.id);
    const children = cyclic ? [] : childrenByParent.get(stake.id) ?? [];
    const hasChildren = children.length > 0;
    const isCollapsed = collapsed.has(stake.id);
    const isReward = stake.kind === "reward";
    const isSelected = selectedStakeId === stake.id;
    const isEditing = editingId === stake.id;

    return (
      <div key={`${stake.id}-${depth}`}>
        <div
          className={`rounded-lg border px-3 py-2 transition-colors ${
            isSelected
              ? "border-amber-400/60 bg-amber-400/5"
              : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700"
          }`}
          style={{ marginLeft: depth * 20 }}
        >
          {/* Header row: title stays left, everything else floats right. */}
          <div className="flex items-center gap-2">
            {/* Accordion chevron (only for chain parents). */}
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggleCollapsed(stake.id)}
                aria-label={isCollapsed ? "Expand chain" : "Collapse chain"}
                aria-expanded={!isCollapsed}
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              >
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
            ) : (
              <span className="inline-block h-5 w-5 shrink-0" />
            )}

            {isReward ? (
              <Gift className="h-4 w-4 shrink-0 text-emerald-400" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
            )}

            {/* Title (left, grows) — click selects the stake. */}
            <button
              type="button"
              onClick={() =>
                setSelectedStakeId((cur) =>
                  cur === stake.id ? null : stake.id,
                )
              }
              className="flex-1 truncate text-left text-sm font-medium text-white hover:text-amber-100"
              title="Click to view linked task(s)"
            >
              {stake.name || "Untitled stake"}
            </button>

            {/* Everything after the title, right-aligned. */}
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <Tooltip
                content={
                  isReward
                    ? "Reward — a payoff you earn if the task lands."
                    : "Consequence — a cost you avoid by keeping the task on track."
                }
                className="inline-flex"
                side="top"
              >
                <span
                  className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none ${
                    isReward
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-200"
                  }`}
                >
                  {isReward ? "reward" : "consequence"}
                </span>
              </Tooltip>

              <Tooltip content={HELP_WEIGHT} className="inline-flex" side="top">
                <span className="text-xs text-zinc-400">
                  weight {formatDollars(stake.effectiveWeight)}
                </span>
              </Tooltip>

              <Tooltip
                content={HELP_FALL_DATE}
                className="inline-flex"
                side="top"
              >
                <span className="text-xs text-zinc-500">
                  {formatFallDate(stake.triggerAt)}
                </span>
              </Tooltip>

              {stake.recurrence ? (
                <span className="text-xs text-zinc-500">
                  {stake.recurrence}
                </span>
              ) : null}

              {stake.resolvers.length > 0 ? (
                <Tooltip
                  content={HELP_RESOLVER}
                  className="inline-flex"
                  side="top"
                >
                  <span className="inline-flex items-center gap-1 text-xs text-sky-300">
                    <Wrench className="h-3 w-3" />
                    {stake.resolvers.length} resolver
                    {stake.resolvers.length === 1 ? "" : "s"}
                    {stake.resolvers.some(
                      (r) => r.resolutionType === "eliminates",
                    )
                      ? " (eliminates)"
                      : ""}
                  </span>
                </Tooltip>
              ) : (
                <Tooltip
                  content={HELP_RESOLVER}
                  className="inline-flex"
                  side="top"
                >
                  <span className="text-xs text-zinc-600">no resolver</span>
                </Tooltip>
              )}

              {cyclic ? (
                <span className="text-[10px] text-red-400">↻ cycle</span>
              ) : null}

              {/* Edit / delete actions. */}
              {!isEditing ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => beginEdit(stake)}
                    aria-label="Edit stake"
                    className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {confirmDeleteId === stake.id ? (
                    <span className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void confirmDelete(stake.id)}
                        disabled={deletingId === stake.id}
                        className="inline-flex items-center gap-1 rounded bg-red-500/20 px-1.5 py-0.5 text-[11px] font-medium text-red-300 hover:bg-red-500/30 disabled:opacity-50"
                      >
                        {deletingId === stake.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                        aria-label="Cancel delete"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmDeleteId(stake.id);
                        setRowError(null);
                      }}
                      aria-label="Delete stake"
                      className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-red-500/20 hover:text-red-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          {/* Inline editor. */}
          {isEditing && draft ? (
            <div className="mt-3 space-y-2 rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
              <div className="flex flex-wrap gap-2">
                <label className="flex flex-1 flex-col gap-1 text-[11px] text-zinc-400">
                  Name
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                    className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 focus:border-amber-400/60 focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-zinc-400">
                  Kind
                  <select
                    value={draft.kind}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        kind: e.target.value as "consequence" | "reward",
                      })
                    }
                    className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 focus:border-amber-400/60 focus:outline-none"
                  >
                    <option value="consequence">consequence</option>
                    <option value="reward">reward</option>
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="flex flex-col gap-1 text-[11px] text-zinc-400">
                  Monetary value ($)
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={draft.monetaryValue}
                    onChange={(e) =>
                      setDraft({ ...draft, monetaryValue: e.target.value })
                    }
                    className="w-36 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 focus:border-amber-400/60 focus:outline-none"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-zinc-400">
                  Fall date
                  <input
                    type="date"
                    value={draft.fallDate}
                    onChange={(e) =>
                      setDraft({ ...draft, fallDate: e.target.value })
                    }
                    className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 focus:border-amber-400/60 focus:outline-none [color-scheme:dark]"
                  />
                </label>
              </div>
              {rowError ? (
                <p className="text-xs text-red-400">{rowError}</p>
              ) : null}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void saveEdit(stake.id)}
                  disabled={savingId === stake.id}
                  className="inline-flex items-center gap-1 rounded-md border border-amber-400/50 bg-amber-400/15 px-2.5 py-1 text-xs font-medium text-amber-200 hover:bg-amber-400/25 disabled:opacity-50"
                >
                  {savingId === stake.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )}
                  Save
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:border-zinc-600"
                >
                  <X className="h-3 w-3" /> Cancel
                </button>
              </div>
            </div>
          ) : null}

          {/* Selected: reveal linked resolver task(s). */}
          {isSelected && !isEditing ? (
            <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-950/50 p-2">
              {stake.resolvers.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  No task is linked to this stake yet. Add a stake to a task to
                  make it a resolver.
                </p>
              ) : (
                <ul className="space-y-1">
                  {stake.resolvers.map((r, i) => (
                    <li
                      key={`${r.taskId}-${i}`}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span className="flex items-center gap-1.5 text-zinc-200">
                        <Wrench className="h-3 w-3 text-sky-300" />
                        {r.taskName || "Linked task"}
                      </span>
                      <Tooltip content={HELP_RESOLVER} className="inline-flex" side="top">
                        <span className="rounded-full border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400">
                          {r.resolutionType === "eliminates"
                            ? "Eliminates"
                            : "Defuses once"}
                        </span>
                      </Tooltip>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>

        {hasChildren && !isCollapsed
          ? children.map((childId) => {
              const child = stakeById.get(childId);
              if (!child) return null;
              return renderStakeRow(child, depth + 1, nextSeen);
            })
          : null}
      </div>
    );
  };

  const totalStakes = data?.stakes.length ?? 0;
  const shownStakes = filteredStakes.length;

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

      {!error && !loading && totalStakes === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <p className="text-center text-sm font-medium text-zinc-300">
            No active stakes yet. Add stakes to a task to see your dominoes here.
          </p>
          <div className="mx-auto mt-4 max-w-xl">
            <DominoHelpContent />
          </div>
        </div>
      ) : null}

      {totalStakes > 0 ? (
        <>
          {/* Gantt timeline at the top. */}
          <DominoGantt
            stakes={ganttStakes}
            selectedId={selectedStakeId}
            onSelect={(id) =>
              setSelectedStakeId((cur) => (cur === id ? null : id))
            }
          />

          {/* Search & filter. */}
          <DominoFilterBar
            state={filter}
            onChange={setFilter}
            total={totalStakes}
            shown={shownStakes}
          />

          {roots.length > 0 ? (
            <div className="space-y-2">
              {roots.map((root) => renderStakeRow(root, 0, new Set<string>()))}
            </div>
          ) : (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-6 text-center text-sm text-zinc-500">
              No stakes match your filters.
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
