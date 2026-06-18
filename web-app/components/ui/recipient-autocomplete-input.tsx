"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";

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

function lastSeparatorIndex(text: string): number {
  let idx = -1;
  for (const sep of SEPARATORS) {
    const i = text.lastIndexOf(sep);
    if (i > idx) idx = i;
  }
  return idx;
}

function getCurrentToken(text: string): string {
  const idx = lastSeparatorIndex(text);
  return text.slice(idx + 1);
}

function formatRecipient(s: ContactSuggestion): string {
  const name = s.name?.trim();
  return name ? `${name} <${s.email}>` : s.email;
}

export function RecipientAutocompleteInput({
  value,
  onChange,
  placeholder,
  className,
}: RecipientAutocompleteInputProps) {
  const [suggestions, setSuggestions] = React.useState<ContactSuggestion[]>([]);
  const [open, setOpen] = React.useState(false);
  const [highlight, setHighlight] = React.useState(0);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const requestSeq = React.useRef(0);

  const runFetch = React.useCallback((token: string) => {
    const trimmed = token.trim();
    if (trimmed.length < 1) {
      abortRef.current?.abort();
      setSuggestions([]);
      setOpen(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const seq = ++requestSeq.current;

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
      })
      .catch(() => {
        if (seq !== requestSeq.current) return;
        setSuggestions([]);
        setOpen(false);
      });
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    onChange(next);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    const token = getCurrentToken(next);
    debounceRef.current = setTimeout(() => runFetch(token), 200);
  };

  const selectSuggestion = React.useCallback(
    (s: ContactSuggestion) => {
      const idx = lastSeparatorIndex(value);
      const prefix = value.slice(0, idx + 1);
      const next = `${prefix}${formatRecipient(s)}, `;
      onChange(next);
      setOpen(false);
      setSuggestions([]);
      requestSeq.current++;
      inputRef.current?.focus();
    },
    [value, onChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) {
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
      <Input
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
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
