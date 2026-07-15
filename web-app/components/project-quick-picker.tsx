"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Project } from "@/lib/types";

function acronym(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * A compact project badge that opens a type-to-search popover for reassigning
 * a task to a different project. Used inline on task rows (e.g. the Today view)
 * so the project can be changed without opening the full task editor.
 */
export function ProjectQuickPicker({
  project,
  projects,
  onSelect,
}: {
  project: Project;
  projects: Project[];
  onSelect: (projectId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const badgeRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const active = projects.filter((p) => !p.archived);
    if (!q) return active;
    return active.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, query]);

  useEffect(() => {
    if (!open) return;
    const badge = badgeRef.current;
    if (badge) {
      const rect = badge.getBoundingClientRect();
      setCoords({ top: rect.bottom + 6, left: rect.left });
    }
    // Focus the search field once the popover mounts.
    const t = setTimeout(() => inputRef.current?.focus(), 0);

    const onDocMouseDown = (e: MouseEvent) => {
      if (
        popoverRef.current?.contains(e.target as Node) ||
        badgeRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span className="relative flex flex-shrink-0 items-center justify-center w-4">
      <button
        ref={badgeRef}
        type="button"
        aria-label={`Project: ${project.name}. Click to change.`}
        onClick={(e) => {
          e.stopPropagation();
          setQuery("");
          setOpen((v) => !v);
        }}
        className="w-4 h-4 rounded-full flex items-center justify-center text-[6px] font-bold text-white transition-transform hover:scale-110"
        style={{ backgroundColor: project.color }}
      >
        {acronym(project.name)}
      </button>

      {open && coords
        ? createPortal(
            <div
              ref={popoverRef}
              style={{ position: "fixed", top: coords.top, left: coords.left }}
              className="z-[100] w-64 rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects…"
                className="mb-2 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-zinc-500"
              />
              <div className="max-h-64 overflow-y-auto">
                {filtered.length === 0 ? (
                  <div className="px-2 py-3 text-center text-xs text-zinc-500">
                    No projects match.
                  </div>
                ) : (
                  filtered.map((p) => {
                    const isCurrent = p.id === project.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          if (!isCurrent) onSelect(p.id);
                        }}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-zinc-800 ${
                          isCurrent ? "text-zinc-400" : "text-zinc-100"
                        }`}
                      >
                        <span
                          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[6px] font-bold text-white"
                          style={{ backgroundColor: p.color }}
                        >
                          {acronym(p.name)}
                        </span>
                        <span className="truncate">{p.name}</span>
                        {isCurrent ? (
                          <span className="ml-auto text-[10px] uppercase text-zinc-500">
                            Current
                          </span>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}
