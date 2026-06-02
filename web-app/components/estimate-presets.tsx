"use client";

import { X } from "lucide-react";

interface EstimatePresetsProps {
  /** Current estimate in minutes, or null/undefined for "no estimate". */
  value: number | null | undefined;
  onChange: (minutes: number | null) => void;
  /** When true, includes the short 1/2/3/5/10/20m chips in addition to the standard set. */
  extended?: boolean;
  /** When true, shows a numeric input alongside the chips. */
  showInput?: boolean;
  className?: string;
}

const STANDARD_PRESETS: { label: string; value: number }[] = [
  { label: "15m", value: 15 },
  { label: "30m", value: 30 },
  { label: "1h", value: 60 },
  { label: "2h", value: 120 },
  { label: "4h", value: 240 },
  { label: "8h", value: 480 },
];

const EXTENDED_PRESETS: { label: string; value: number }[] = [
  { label: "1m", value: 1 },
  { label: "2m", value: 2 },
  { label: "3m", value: 3 },
  { label: "5m", value: 5 },
  { label: "10m", value: 10 },
  { label: "20m", value: 20 },
  { label: "45m", value: 45 },
  { label: "90m", value: 90 },
  { label: "3h", value: 180 },
  { label: "6h", value: 360 },
];

/**
 * Single-click time-estimate chips. Shared between the task modal and the
 * bulk Estimate Review modal so the keyboard hint and styling stay in sync.
 */
export function EstimatePresets({
  value,
  onChange,
  extended,
  showInput,
  className,
}: EstimatePresetsProps) {
  const presets = extended
    ? [...EXTENDED_PRESETS, ...STANDARD_PRESETS].sort((a, b) => a.value - b.value)
    : STANDARD_PRESETS;

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      {showInput ? (
        <div className="bg-zinc-800 rounded-lg flex items-center pr-2 focus-within:ring-2 focus-within:ring-[var(--theme-primary)]">
          <input
            type="number"
            min={1}
            max={480}
            value={value ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") return onChange(null);
              const n = parseInt(v, 10);
              if (Number.isFinite(n)) onChange(Math.min(480, Math.max(1, n)));
            }}
            placeholder="Minutes"
            className="w-20 bg-transparent text-white pl-3 pr-2 py-2 text-sm focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="text-xs text-zinc-500 pr-2">min</span>
          {value != null && (
            <button
              onClick={() => onChange(null)}
              className="text-zinc-400 hover:text-zinc-200 transition-colors p-1"
              type="button"
              aria-label="Clear estimate"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset) => {
          const active = value === preset.value;
          return (
            <button
              key={preset.value}
              type="button"
              onClick={() => onChange(active ? null : preset.value)}
              className={`px-2 py-1 rounded text-xs border transition-colors ${
                active
                  ? "bg-[rgb(var(--theme-primary-rgb))]/20 text-[rgb(var(--theme-primary-rgb))] border-[rgb(var(--theme-primary-rgb))]/40"
                  : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-500 hover:text-zinc-300"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
