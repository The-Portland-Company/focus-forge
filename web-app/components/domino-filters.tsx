"use client";

import type { JSX } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterStake {
  id: string;
  name: string | null;
  kind: "consequence" | "reward";
  triggerAt: string | null;
  status: string;
}

export interface DominoFilterState {
  query: string;
  kinds: ("consequence" | "reward")[]; // empty = all
  onlyWithFallDate: boolean;
  onlyOverdue: boolean; // trigger_at <= now
}

export function defaultDominoFilterState(): DominoFilterState {
  return {
    query: "",
    kinds: [],
    onlyWithFallDate: false,
    onlyOverdue: false,
  };
}

export function filterStakes<T extends FilterStake>(
  stakes: T[],
  state: DominoFilterState,
): T[] {
  const q = state.query.trim().toLowerCase();
  const now = Date.now();

  return stakes.filter((s) => {
    if (q) {
      const name = (s.name ?? "").toLowerCase();
      if (!name.includes(q)) return false;
    }

    if (state.kinds.length > 0 && !state.kinds.includes(s.kind)) {
      return false;
    }

    if (state.onlyWithFallDate && s.triggerAt == null) {
      return false;
    }

    if (state.onlyOverdue) {
      if (s.triggerAt == null) return false;
      const t = Date.parse(s.triggerAt);
      if (Number.isNaN(t) || t > now) return false;
    }

    return true;
  });
}

function isFilterActive(state: DominoFilterState): boolean {
  return (
    state.query.trim() !== "" ||
    state.kinds.length > 0 ||
    state.onlyWithFallDate ||
    state.onlyOverdue
  );
}

export function DominoFilterBar(props: {
  state: DominoFilterState;
  onChange: (next: DominoFilterState) => void;
  total: number;
  shown: number;
}): JSX.Element {
  const { state, onChange, total, shown } = props;

  const toggleKind = (kind: "consequence" | "reward") => {
    const has = state.kinds.includes(kind);
    const kinds = has
      ? state.kinds.filter((k) => k !== kind)
      : [...state.kinds, kind];
    onChange({ ...state, kinds });
  };

  const active = isFilterActive(state);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
      {/* Search */}
      <div className="relative flex min-w-[180px] flex-1 items-center">
        <Search className="pointer-events-none absolute left-2.5 h-4 w-4 text-zinc-500" />
        <input
          type="text"
          value={state.query}
          onChange={(e) => onChange({ ...state, query: e.target.value })}
          placeholder="Search stakes…"
          className="w-full rounded-md border border-zinc-800 bg-zinc-950 py-1.5 pl-8 pr-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400/60 focus:outline-none focus:ring-1 focus:ring-amber-400/40"
        />
      </div>

      {/* Kind chips */}
      <div className="flex items-center gap-1.5">
        <KindChip
          label="Consequence"
          active={state.kinds.includes("consequence")}
          onClick={() => toggleKind("consequence")}
        />
        <KindChip
          label="Reward"
          active={state.kinds.includes("reward")}
          onClick={() => toggleKind("reward")}
        />
      </div>

      {/* Boolean toggles */}
      <div className="flex items-center gap-3">
        <ToggleCheckbox
          label="Has fall date"
          checked={state.onlyWithFallDate}
          onChange={(v) => onChange({ ...state, onlyWithFallDate: v })}
        />
        <ToggleCheckbox
          label="Overdue"
          checked={state.onlyOverdue}
          onChange={(v) => onChange({ ...state, onlyOverdue: v })}
        />
      </div>

      {/* Count + clear */}
      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs text-zinc-500">
          Showing {shown} of {total}
        </span>
        {active && (
          <button
            type="button"
            onClick={() => onChange(defaultDominoFilterState())}
            className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-300 transition-colors hover:border-zinc-700 hover:text-zinc-100"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function KindChip(props: {
  label: string;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-pressed={props.active}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        props.active
          ? "border-amber-400 bg-amber-400/15 text-amber-300"
          : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200",
      )}
    >
      {props.label}
    </button>
  );
}

function ToggleCheckbox(props: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}): JSX.Element {
  return (
    <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-zinc-400">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-zinc-700 bg-zinc-950 text-amber-400 accent-amber-400 focus:ring-1 focus:ring-amber-400/40"
      />
      <span className={cn(props.checked && "text-amber-300")}>
        {props.label}
      </span>
    </label>
  );
}
