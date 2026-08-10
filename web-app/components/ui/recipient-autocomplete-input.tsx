"use client";

import * as React from "react";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type RecipientAutocompleteInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

type ContactSuggestion = {
  email: string;
  name?: string | null;
  count?: number;
};

type SuggestResponse = {
  suggestions?: ContactSuggestion[];
};

const SEPARATORS = [",", ";", "\n"];
const SEPARATOR_REGEX = /[\n,;]+/;

function lastSeparatorIndex(text: string): number {
  let idx = -1;
  for (const sep of SEPARATORS) {
    const i = text.lastIndexOf(sep);
    if (i > idx) idx = i;
  }
  return idx;
}

function formatRecipient(s: ContactSuggestion): string {
  const name = s.name?.trim();
  return name ? `${name} <${s.email}>` : s.email;
}

// A committed recipient carries the raw token (so onChange round-trips
// losslessly) plus a friendly label to show inside the chip.
type Chip = { raw: string; label: string };

function chipLabel(raw: string): string {
  const angle = raw.match(/^(.*)<([^>]+)>\s*$/);
  if (angle) {
    const name = angle[1].trim();
    return name || angle[2].trim();
  }
  return raw.trim();
}

// The editable pieces behind a chip. A raw token is either a bare address or
// `Display Name <address>`; the display name is split on the first space so a
// first/last pair round-trips, while a single-word or multi-word name lands
// wholly in firstName rather than being lost.
export type RecipientParts = {
  firstName: string;
  lastName: string;
  email: string;
};

export function parseRecipientParts(raw: string): RecipientParts {
  const angle = raw.match(/^(.*)<([^>]+)>\s*$/);
  const name = (angle ? angle[1] : "").trim().replace(/^"|"$/g, "").trim();
  const email = (angle ? angle[2] : raw).trim();
  if (!name) return { firstName: "", lastName: "", email };
  const firstSpace = name.indexOf(" ");
  if (firstSpace === -1) return { firstName: name, lastName: "", email };
  return {
    firstName: name.slice(0, firstSpace).trim(),
    lastName: name.slice(firstSpace + 1).trim(),
    email,
  };
}

// Rebuild a raw token from edited parts. No name → bare address (so a chip the
// user blanked the name on doesn't become `<addr>`); any name → `Name <addr>`.
export function buildRecipientRaw(parts: RecipientParts): string {
  const name = `${parts.firstName.trim()} ${parts.lastName.trim()}`.trim();
  const email = parts.email.trim();
  return name ? `${name} <${email}>` : email;
}

export function RecipientAutocompleteInput({
  value,
  onChange,
  placeholder,
  className,
}: RecipientAutocompleteInputProps) {
  const [suggestions, setSuggestions] = React.useState<ContactSuggestion[]>([]);
  // True from the first keystroke until the matching /suggest response lands,
  // so the field shows a spinner instead of looking idle while searching.
  const [searching, setSearching] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [highlight, setHighlight] = React.useState(0);
  // Index of the chip being edited via the double-click popover, or null.
  const [editingIndex, setEditingIndex] = React.useState<number | null>(null);
  const [editParts, setEditParts] = React.useState<RecipientParts>({
    firstName: "",
    lastName: "",
    email: "",
  });

  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const requestSeq = React.useRef(0);

  // Split value into committed chips (everything before the last separator)
  // and the trailing, still-editable token (shown in the text input).
  const { chips, inputValue } = React.useMemo(() => {
    const sepIdx = lastSeparatorIndex(value);
    const prefix = value.slice(0, sepIdx + 1);
    const trailing = value.slice(sepIdx + 1);
    const committed = prefix
      .split(SEPARATOR_REGEX)
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .map<Chip>((raw) => ({ raw, label: chipLabel(raw) }));
    return { chips: committed, inputValue: trailing.replace(/^\s+/, "") };
  }, [value]);

  // Rebuild the single comma-joined string the consumer expects, e.g.
  // `Alice <alice@x.com>, Bob <bob@y.com>, halfTyped`.
  const buildValue = React.useCallback(
    (chipRaws: string[], trailing: string) =>
      chipRaws.length > 0 ? `${chipRaws.join(", ")}, ${trailing}` : trailing,
    []
  );

  const runFetch = React.useCallback((token: string) => {
    const trimmed = token.trim();
    if (trimmed.length < 1) {
      abortRef.current?.abort();
      setSuggestions([]);
      setSearching(false);
      setOpen(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const seq = ++requestSeq.current;
    setSearching(true);

    fetch(
      `/api/email/contacts/suggest?q=${encodeURIComponent(trimmed)}&limit=8`,
      { credentials: "include", signal: controller.signal }
    )
      .then((res) => {
        if (!res.ok) throw new Error(`suggest failed: ${res.status}`);
        return res.json() as Promise<SuggestResponse>;
      })
      .then((data) => {
        if (seq !== requestSeq.current) return;
        const next = Array.isArray(data.suggestions) ? data.suggestions : [];
        setSuggestions(next);
        setHighlight(0);
        setOpen(next.length > 0);
        setSearching(false);
      })
      .catch(() => {
        if (seq !== requestSeq.current) return;
        setSuggestions([]);
        setOpen(false);
        setSearching(false);
      });
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextToken = e.target.value;
    onChange(buildValue(chips.map((c) => c.raw), nextToken));

    setSearching(nextToken.trim().length > 0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runFetch(nextToken), 200);
  };

  const selectSuggestion = React.useCallback(
    (s: ContactSuggestion) => {
      // Commit the suggestion as a chip; the trailing input becomes empty.
      onChange(buildValue([...chips.map((c) => c.raw), formatRecipient(s)], ""));
      setOpen(false);
      setSuggestions([]);
      setSearching(false);
      requestSeq.current++;
      inputRef.current?.focus();
    },
    [chips, onChange, buildValue]
  );

  const removeChip = React.useCallback(
    (index: number) => {
      const nextRaws = chips.map((c) => c.raw).filter((_, i) => i !== index);
      onChange(buildValue(nextRaws, inputValue));
      inputRef.current?.focus();
    },
    [chips, inputValue, onChange, buildValue]
  );

  const beginEditChip = React.useCallback(
    (index: number) => {
      const chip = chips[index];
      if (!chip) return;
      setEditParts(parseRecipientParts(chip.raw));
      setEditingIndex(index);
      setOpen(false);
    },
    [chips]
  );

  // Commit the popover edits back into the chip. An empty email drops the chip
  // entirely rather than leaving a nameless placeholder.
  const commitEditChip = React.useCallback(() => {
    if (editingIndex === null) return;
    const raws = chips.map((c) => c.raw);
    if (!editParts.email.trim()) {
      const nextRaws = raws.filter((_, i) => i !== editingIndex);
      onChange(buildValue(nextRaws, inputValue));
    } else {
      raws[editingIndex] = buildRecipientRaw(editParts);
      onChange(buildValue(raws, inputValue));
    }
    setEditingIndex(null);
  }, [chips, editingIndex, editParts, inputValue, onChange, buildValue]);

  // The outside-click handler is registered once, so it reads the live commit
  // through a ref instead of capturing a stale closure.
  const commitEditChipRef = React.useRef(commitEditChip);
  commitEditChipRef.current = commitEditChip;

  const handleEditKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitEditChip();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setEditingIndex(null);
      }
    },
    [commitEditChip]
  );

  // Commit the trailing typed token as a chip (no trailing comma required —
  // leaving the field or pressing Enter is enough).
  const commitTrailingToken = React.useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    onChange(buildValue([...chips.map((c) => c.raw), trimmed], ""));
    setOpen(false);
    setSuggestions([]);
    setSearching(false);
    requestSeq.current++;
  }, [buildValue, chips, inputValue, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Backspace on an empty token removes the last committed chip.
    if (
      e.key === "Backspace" &&
      inputValue.length === 0 &&
      chips.length > 0 &&
      !open
    ) {
      e.preventDefault();
      removeChip(chips.length - 1);
      return;
    }

    if (!open || suggestions.length === 0) {
      // With no suggestion list open, Enter commits the typed address as a
      // chip instead of doing nothing.
      if (e.key === "Enter" && inputValue.trim()) {
        e.preventDefault();
        commitTrailingToken();
        return;
      }
      if (e.key === "Escape") setOpen(false);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      const current = suggestions[highlight];
      if (current) {
        e.preventDefault();
        selectSuggestion(current);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  React.useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        // A click outside the field also commits an open chip editor, matching
        // how the trailing text token commits on blur.
        commitEditChipRef.current();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div
        className={cn(
          "flex min-h-11 sm:min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800/50 px-2 py-1.5 text-base text-white ring-offset-zinc-950 focus-within:outline-none focus-within:ring-2 ring-theme focus-within:ring-offset-2 md:text-sm transition-all",
          className
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {chips.map((chip, i) => (
          <span
            key={`${chip.raw}-${i}`}
            className="relative inline-flex max-w-full items-center gap-1 rounded-md bg-zinc-700/70 px-2 py-0.5 text-xs font-medium text-zinc-100"
          >
            <span
              className="cursor-text truncate"
              // Double-click opens the name/email editor for this recipient.
              onDoubleClick={(e) => {
                e.stopPropagation();
                beginEditChip(i);
              }}
              title="Double-click to edit"
            >
              {chip.label}
            </span>
            <button
              type="button"
              aria-label={`Remove ${chip.label}`}
              className="shrink-0 rounded-sm text-zinc-400 hover:text-white focus:outline-none focus-visible:ring-1 ring-theme"
              onClick={(e) => {
                e.stopPropagation();
                removeChip(i);
              }}
            >
              <X className="h-3 w-3" />
            </button>
            {editingIndex === i ? (
              <div
                className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    autoFocus
                    value={editParts.firstName}
                    onChange={(e) =>
                      setEditParts((p) => ({ ...p, firstName: e.target.value }))
                    }
                    onKeyDown={handleEditKeyDown}
                    placeholder="First name"
                    className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 ring-theme"
                  />
                  <input
                    value={editParts.lastName}
                    onChange={(e) =>
                      setEditParts((p) => ({ ...p, lastName: e.target.value }))
                    }
                    onKeyDown={handleEditKeyDown}
                    placeholder="Last name"
                    className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 ring-theme"
                  />
                </div>
                <input
                  value={editParts.email}
                  onChange={(e) =>
                    setEditParts((p) => ({ ...p, email: e.target.value }))
                  }
                  onKeyDown={handleEditKeyDown}
                  placeholder="Email address"
                  className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 ring-theme"
                />
                <div className="mt-2 flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditingIndex(null)}
                    className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={commitEditChip}
                    className="rounded-md bg-theme-gradient px-2 py-1 text-xs font-medium text-white"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : null}
          </span>
        ))}
        <input
          ref={inputRef}
          value={inputValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true);
          }}
          // Exiting the field turns the typed address into a chip. Picking a
          // suggestion is safe: the option uses onPointerDown+preventDefault,
          // so the input never blurs on that path.
          onBlur={commitTrailingToken}
          placeholder={chips.length === 0 ? placeholder : undefined}
          autoComplete="off"
          className="min-w-[8rem] flex-1 border-0 bg-transparent p-0.5 text-base text-white placeholder:text-zinc-400 focus:outline-none focus:ring-0 md:text-sm"
        />
        {searching ? (
          <Loader2
            aria-label="Searching contacts"
            role="status"
            className="h-4 w-4 shrink-0 animate-spin text-zinc-400"
          />
        ) : null}
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-lg">
          {suggestions.map((s, i) => (
            <div
              key={`${s.email}-${i}`}
              role="option"
              aria-selected={i === highlight}
              className={`px-3 py-2 text-sm cursor-pointer ${
                i === highlight ? "bg-zinc-800" : "hover:bg-zinc-800"
              }`}
              onMouseEnter={() => setHighlight(i)}
              onPointerDown={(e) => {
                e.preventDefault();
                selectSuggestion(s);
              }}
            >
              {s.name?.trim() ? (
                <>
                  <div className="text-white">{s.name}</div>
                  <div className="text-zinc-400">{s.email}</div>
                </>
              ) : (
                <div className="text-zinc-100">{s.email}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
