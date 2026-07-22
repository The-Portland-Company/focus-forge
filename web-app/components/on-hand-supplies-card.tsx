"use client";

import { useCallback, useEffect, useState } from "react";
import { Boxes, Plus, Trash2, Check, X, Pencil } from "lucide-react";
import type { OnHandSupply } from "@/lib/types";

/**
 * "Supplies on hand" card: an itemized list of general supplies already
 * available, scoped to a project and optionally a section or task. These are a
 * reference list, not tasks — there is no checkbox and nothing is completed.
 *
 * Items lay out in a responsive grid (1 → 3 → 5 columns) so a long supply list
 * reads as a compact wall of chips rather than a tall column. Fetches its own
 * data so it can drop into a project view, a section header, or a task modal
 * without threading through the core database load.
 */

type Scope = { sectionId?: string; taskId?: string };

interface DraftFields {
  name: string;
  quantity: string;
  unit: string;
  note: string;
}

const EMPTY_DRAFT: DraftFields = { name: "", quantity: "", unit: "", note: "" };

function quantityLabel(s: OnHandSupply): string {
  if (s.quantity == null && !s.unit) return "";
  const q = s.quantity == null ? "" : String(Number(s.quantity));
  return [q, s.unit].filter(Boolean).join(" ");
}

export function OnHandSuppliesCard({
  projectId,
  scope,
  title = "Supplies on hand",
  labelFor,
  className = "",
}: {
  projectId: string;
  /** Restrict to (and create within) a section or task. Omit for project-wide. */
  scope?: Scope;
  title?: string;
  /** Optional scope chip for each item (used in the project-wide view). */
  labelFor?: (supply: OnHandSupply) => string | null;
  className?: string;
}) {
  const [supplies, setSupplies] = useState<OnHandSupply[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<DraftFields>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<DraftFields>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);

  const inScope = useCallback(
    (s: OnHandSupply) => {
      if (scope?.taskId) return s.taskId === scope.taskId;
      if (scope?.sectionId) return s.sectionId === scope.sectionId;
      return true;
    },
    [scope?.taskId, scope?.sectionId],
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/on-hand-supplies?projectId=${encodeURIComponent(projectId)}`,
        { credentials: "include" },
      );
      if (!res.ok) return;
      const body = await res.json();
      setSupplies((body.supplies || []) as OnHandSupply[]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = supplies.filter(inScope);

  const create = async () => {
    const name = draft.name.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/on-hand-supplies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          projectId,
          sectionId: scope?.sectionId,
          taskId: scope?.taskId,
          name,
          quantity: draft.quantity,
          unit: draft.unit,
          note: draft.note,
        }),
      });
      if (res.ok) {
        const created = (await res.json()) as OnHandSupply;
        setSupplies((prev) => [...prev, created]);
        setDraft(EMPTY_DRAFT);
        setAdding(false);
      }
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (id: string) => {
    const name = editDraft.name.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/on-hand-supplies/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          quantity: editDraft.quantity,
          unit: editDraft.unit,
          note: editDraft.note,
        }),
      });
      if (res.ok) {
        const updated = (await res.json()) as OnHandSupply;
        setSupplies((prev) => prev.map((s) => (s.id === id ? updated : s)));
        setEditingId(null);
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    const prev = supplies;
    setSupplies((cur) => cur.filter((s) => s.id !== id));
    const res = await fetch(`/api/on-hand-supplies/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) setSupplies(prev); // restore on failure
  };

  const beginEdit = (s: OnHandSupply) => {
    setEditingId(s.id);
    setEditDraft({
      name: s.name,
      quantity: s.quantity == null ? "" : String(s.quantity),
      unit: s.unit ?? "",
      note: s.note ?? "",
    });
  };

  const fieldClass =
    "w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500/50 focus:outline-none";

  if (loading && supplies.length === 0) {
    return (
      <div className={`rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 ${className}`}>
        <div className="h-4 w-32 animate-pulse rounded bg-zinc-800" />
      </div>
    );
  }

  // Nothing to show and no way to add (shouldn't happen — always addable).
  if (visible.length === 0 && !adding) {
    return (
      <div className={`rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 ${className}`}>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-medium text-amber-200">
            <Boxes className="h-3.5 w-3.5" /> {title}
          </span>
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-300 hover:text-white"
          >
            <Plus className="h-3 w-3" /> Add supply
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-amber-500/20 bg-amber-500/[0.03] p-3 ${className}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium text-amber-200">
          <Boxes className="h-3.5 w-3.5" /> {title}
          <span className="text-amber-300/50">({visible.length})</span>
        </span>
        <button
          onClick={() => setAdding((v) => !v)}
          className="inline-flex items-center gap-1 rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-300 hover:text-white"
        >
          <Plus className="h-3 w-3" /> Add supply
        </button>
      </div>

      {adding && (
        <div className="mb-2 grid grid-cols-1 gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 p-2 sm:grid-cols-[2fr_1fr_1fr_2fr_auto]">
          <input
            autoFocus
            className={fieldClass}
            placeholder="Supply name"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <input
            className={fieldClass}
            placeholder="Qty"
            inputMode="decimal"
            value={draft.quantity}
            onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <input
            className={fieldClass}
            placeholder="Unit"
            value={draft.unit}
            onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <input
            className={fieldClass}
            placeholder="Note"
            value={draft.note}
            onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <div className="flex items-center gap-1">
            <button
              onClick={create}
              disabled={!draft.name.trim() || busy}
              className="rounded bg-amber-500/20 p-1 text-amber-200 hover:bg-amber-500/30 disabled:opacity-40"
              aria-label="Save supply"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => {
                setAdding(false);
                setDraft(EMPTY_DRAFT);
              }}
              className="rounded p-1 text-zinc-400 hover:text-white"
              aria-label="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 md:grid-cols-3 xl:grid-cols-5">
        {visible.map((s) => {
          const scopeLabel = labelFor?.(s);
          const qty = quantityLabel(s);
          if (editingId === s.id) {
            return (
              <div
                key={s.id}
                className="flex flex-col gap-1 rounded-md border border-amber-500/30 bg-zinc-900 p-2"
              >
                <input
                  autoFocus
                  className={fieldClass}
                  value={editDraft.name}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, name: e.target.value })
                  }
                  onKeyDown={(e) => e.key === "Enter" && saveEdit(s.id)}
                />
                <div className="flex gap-1">
                  <input
                    className={fieldClass}
                    placeholder="Qty"
                    inputMode="decimal"
                    value={editDraft.quantity}
                    onChange={(e) =>
                      setEditDraft({ ...editDraft, quantity: e.target.value })
                    }
                  />
                  <input
                    className={fieldClass}
                    placeholder="Unit"
                    value={editDraft.unit}
                    onChange={(e) =>
                      setEditDraft({ ...editDraft, unit: e.target.value })
                    }
                  />
                </div>
                <input
                  className={fieldClass}
                  placeholder="Note"
                  value={editDraft.note}
                  onChange={(e) =>
                    setEditDraft({ ...editDraft, note: e.target.value })
                  }
                  onKeyDown={(e) => e.key === "Enter" && saveEdit(s.id)}
                />
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => saveEdit(s.id)}
                    disabled={busy}
                    className="rounded bg-amber-500/20 p-1 text-amber-200 hover:bg-amber-500/30"
                    aria-label="Save"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="rounded p-1 text-zinc-400 hover:text-white"
                    aria-label="Cancel"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          }
          return (
            <div
              key={s.id}
              className="group/supply relative flex flex-col rounded-md border border-zinc-800 bg-zinc-900 p-2"
            >
              <div className="flex items-start justify-between gap-1">
                <span className="min-w-0 break-words text-xs font-medium text-zinc-100">
                  {s.name}
                </span>
                {qty && (
                  <span className="shrink-0 rounded bg-amber-500/10 px-1 py-0.5 text-[10px] font-medium text-amber-200">
                    {qty}
                  </span>
                )}
              </div>
              {s.note && (
                <span className="mt-0.5 break-words text-[11px] text-zinc-500">
                  {s.note}
                </span>
              )}
              {scopeLabel && (
                <span className="mt-1 truncate text-[10px] uppercase tracking-wide text-zinc-600">
                  {scopeLabel}
                </span>
              )}
              <div className="absolute right-1 top-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/supply:opacity-100">
                <button
                  onClick={() => beginEdit(s)}
                  className="rounded p-0.5 text-zinc-500 hover:text-white"
                  aria-label="Edit supply"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={() => remove(s.id)}
                  className="rounded p-0.5 text-zinc-500 hover:text-red-400"
                  aria-label="Delete supply"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
