"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SearchableSelectOption = {
  value: string;
  label: string;
};

type SearchableSelectProps = {
  value: string | null;
  onChange: (value: string | null) => void;
  options: SearchableSelectOption[];
  /** Label for the always-present "nothing selected" row, e.g. "No project". */
  emptyOptionLabel: string;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
};

/**
 * The rows a SearchableSelect shows for a given query.
 *
 * The clear row ("No project") always leads the list and is never filtered out,
 * so a mis-pick is always one keystroke away from being undone — even when the
 * search box holds text that matches nothing.
 */
export function buildSearchableSelectRows(
  options: SearchableSelectOption[],
  query: string,
  emptyOptionLabel: string,
): SearchableSelectOption[] {
  const normalized = query.trim().toLowerCase();
  const matches = normalized
    ? options.filter((option) =>
        option.label.toLowerCase().includes(normalized),
      )
    : options;
  return [{ value: "", label: emptyOptionLabel }, ...matches];
}

/**
 * A select you can type into.
 *
 * Radix Select owns keyboard input for its own first-letter typeahead, so a
 * search box inside it fights the primitive for focus and keystrokes. This is a
 * plain listbox instead — same visual language as the Radix trigger it replaces,
 * but the open state is a filter box over the options. It follows the keyboard
 * and pointer conventions already used by RecipientAutocompleteInput
 * (highlight + ArrowUp/Down/Enter/Escape, onPointerDown so the input never
 * blurs out from under a click).
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  emptyOptionLabel,
  placeholder,
  searchPlaceholder = "Type to search…",
  className,
  disabled,
  "aria-label": ariaLabel,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [highlight, setHighlight] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);

  const selected = options.find((option) => option.value === value) || null;

  const rows = React.useMemo(
    () => buildSearchableSelectRows(options, query, emptyOptionLabel),
    [emptyOptionLabel, options, query],
  );

  // Opening starts from a clean box, focused, with the highlight on whatever is
  // currently selected so Enter is a no-op rather than a surprise change.
  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    const index = rows.findIndex((row) => row.value === (value || ""));
    setHighlight(index >= 0 ? index : 0);
    const timer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
    // Only on open: re-running as `rows` changes would fight the user's typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Typing shrinks the list, so an out-of-range highlight has to come back.
  React.useEffect(() => {
    setHighlight((current) => (current >= rows.length ? 0 : current));
  }, [rows.length]);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Keep the highlighted row visible when arrowing past the fold.
  React.useEffect(() => {
    if (!open) return;
    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${highlight}"]`,
    );
    node?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  const commit = (nextValue: string) => {
    onChange(nextValue || null);
    setOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((current) => Math.min(current + 1, rows.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const row = rows[highlight];
      if (row) commit(row.value);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex h-10 w-full items-center justify-between rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white ring-offset-zinc-950 focus:outline-none focus:ring-2 ring-theme focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all",
          className,
        )}
      >
        <span
          className={cn("truncate", !selected && "text-zinc-400")}
        >
          {selected?.label || placeholder || emptyOptionLabel}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-lg">
          <div className="border-b border-zinc-800 p-2">
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={searchPlaceholder}
              autoComplete="off"
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-base text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 ring-theme md:text-sm"
            />
          </div>
          <div
            ref={listRef}
            role="listbox"
            className="max-h-64 overflow-auto py-1"
          >
            {rows.length === 1 && query.trim() ? (
              <div className="px-3 py-2 text-sm text-zinc-500">No matches</div>
            ) : null}
            {rows.map((row, index) => (
              <div
                key={row.value || "__none__"}
                data-index={index}
                role="option"
                aria-selected={row.value === (value || "")}
                onMouseEnter={() => setHighlight(index)}
                onPointerDown={(event) => {
                  event.preventDefault();
                  commit(row.value);
                }}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm",
                  index === highlight ? "bg-zinc-800" : "hover:bg-zinc-800",
                  !row.value && "text-zinc-400",
                )}
              >
                <span className="truncate">{row.label}</span>
                {row.value === (value || "") ? (
                  <Check className="h-4 w-4 shrink-0 text-zinc-300" />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
