"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EstimatePresets } from "@/components/estimate-presets";
import {
  EstimateHelpButton,
  EstimateHelpModal,
} from "@/components/estimate-help-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Flag,
  FolderX,
  Loader2,
  Repeat,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/input";

interface UnestimatedTask {
  id: string;
  name: string;
  description?: string | null;
  priority?: number | null;
  dueDate?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  organizationName?: string | null;
  tags?: string[];
  subtaskCount?: number | null;
  recurringPattern?: string | null;
  isRecurring?: boolean;
}

interface AiSuggestion {
  minutes: number;
  confidence: "low" | "med" | "high";
  rationale?: string;
}

export interface EstimateReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after at least one task was saved. Parent can refetch. */
  onCompleted?: (savedCount: number) => void;
  /** How many tasks to pull in this session. Defaults to 20. */
  batchSize?: number;
  projectId?: string | null;
  orgId?: string | null;
}

const PRIORITY_COLOR: Record<number, string> = {
  1: "text-red-400",
  2: "text-orange-400",
  3: "text-blue-400",
  4: "text-zinc-400",
};

const CONFIDENCE_LABEL: Record<AiSuggestion["confidence"], string> = {
  low: "low confidence",
  med: "medium confidence",
  high: "high confidence",
};

function fmtDue(due?: string | null): string | null {
  if (!due) return null;
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function EstimateReviewModal({
  isOpen,
  onClose,
  onCompleted,
  batchSize = 20,
  projectId,
  orgId,
}: EstimateReviewModalProps) {
  const [tasks, setTasks] = useState<UnestimatedTask[]>([]);
  const [index, setIndex] = useState(0);
  const [suggestions, setSuggestions] = useState<Record<string, AiSuggestion>>({});
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [value, setValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [pageInput, setPageInput] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Delete flow state
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [recurringDeleteOpen, setRecurringDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // For recurring tasks, which scopes to act on.
  const [delThis, setDelThis] = useState(true);
  const [delFuture, setDelFuture] = useState(false);
  const [delPast, setDelPast] = useState(false);

  // Help modal
  const [helpOpen, setHelpOpen] = useState(false);

  // Project delete flow state
  const [confirmDeleteProjectOpen, setConfirmDeleteProjectOpen] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);
  const [projectNameConfirm, setProjectNameConfirm] = useState("");

  const current = tasks[index];
  const currentSuggestion = current ? suggestions[current.id] : undefined;
  const isRecurring = Boolean(
    current?.isRecurring || (current?.recurringPattern && current.recurringPattern.trim())
  );

  const advance = useCallback(() => {
    setValue(null);
    setError(null);
    setIndex((i) => i + 1);
  }, []);

  // Navigate to an arbitrary card without saving.
  const goTo = useCallback(
    (i: number) => {
      if (tasks.length === 0) return;
      const clamped = Math.max(0, Math.min(i, tasks.length - 1));
      setValue(null);
      setError(null);
      setIndex(clamped);
    },
    [tasks.length]
  );

  const finish = useCallback(() => {
    onCompleted?.(savedCount);
    setSavedCount(0);
    setTasks([]);
    setIndex(0);
    setSuggestions({});
    setValue(null);
    onClose();
  }, [onClose, onCompleted, savedCount]);

  // Load the initial batch when the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const params = new URLSearchParams();
    params.set("limit", String(batchSize));
    if (projectId) params.set("projectId", projectId);
    if (orgId) params.set("orgId", orgId);
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/tasks/unestimated?${params.toString()}`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`Failed to load tasks (${res.status})`);
        const json = await res.json();
        if (cancelled) return;
        const list: UnestimatedTask[] = json.tasks ?? [];
        setTasks(list);
        setIndex(0);
        setValue(null);

        // Kick off AI suggestions for the whole batch.
        if (list.length > 0) {
          setSuggestionsLoading(true);
          fetch("/api/tasks/estimate/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ taskIds: list.map((t) => t.id) }),
          })
            .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
            .then((data: { results: any[] }) => {
              if (cancelled) return;
              const next: Record<string, AiSuggestion> = {};
              for (const r of data.results ?? []) {
                if (r?.taskId && typeof r?.minutes === "number") {
                  next[r.taskId] = {
                    minutes: r.minutes,
                    confidence: r.confidence ?? "low",
                    rationale: r.rationale,
                  };
                }
              }
              setSuggestions(next);
            })
            .catch((e) => {
              if (!cancelled) setError(typeof e === "string" ? e : "AI suggestions failed");
            })
            .finally(() => {
              if (!cancelled) setSuggestionsLoading(false);
            });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, batchSize, projectId, orgId]);

  // Pre-fill the input with the AI suggestion when arriving at a new card.
  useEffect(() => {
    if (current && currentSuggestion && value == null) {
      setValue(currentSuggestion.minutes);
    }
    // intentionally not depending on `value` — we only auto-fill once per card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, currentSuggestion?.minutes]);

  const saveCurrent = useCallback(async () => {
    if (!current || value == null) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/tasks/estimate/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          taskId: current.id,
          minutes: value,
          aiSuggestedMinutes: currentSuggestion?.minutes,
          aiConfidence: currentSuggestion?.confidence,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `Save failed (${res.status})`);
      }
      setSavedCount((n) => n + 1);
      advance();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [current, value, currentSuggestion, advance]);

  // Remove the current card from the local list and keep the index valid.
  const dropCurrent = useCallback(() => {
    setTasks((prev) => prev.filter((t) => t.id !== current?.id));
    setSuggestions((prev) => {
      if (!current) return prev;
      const next = { ...prev };
      delete next[current.id];
      return next;
    });
    setValue(null);
    setError(null);
    // Stay on the same index; the next task slides into place. Clamp on render.
    setIndex((i) => Math.max(0, Math.min(i, tasks.length - 2)));
  }, [current, tasks.length]);

  // Open the right confirmation surface for the delete button.
  const requestDelete = useCallback(() => {
    if (!current) return;
    if (isRecurring) {
      setDelThis(true);
      setDelFuture(false);
      setDelPast(false);
      setRecurringDeleteOpen(true);
    } else {
      setConfirmDeleteOpen(true);
    }
  }, [current, isRecurring]);

  // Soft-delete the whole task row via the trash/soft-delete path.
  const softDeleteCurrent = useCallback(async () => {
    if (!current) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${current.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `Delete failed (${res.status})`);
      }
      setConfirmDeleteOpen(false);
      dropCurrent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }, [current, dropCurrent]);

  // Recurring delete: combine the chosen scopes.
  //  - "This task" (+ "Past"): soft-delete the entire recurring task row. Since
  //    recurring tasks are a single row + pattern (no per-instance rows), there is
  //    no separate past occurrence to remove; deleting the row removes its history.
  //  - "Future" only: end the recurrence by clearing the pattern, keeping the
  //    current occurrence as a one-off task.
  const recurringDeleteCurrent = useCallback(async () => {
    if (!current) return;
    if (!delThis && !delFuture && !delPast) return;
    setDeleting(true);
    setError(null);
    try {
      // Deleting "this" (or "past", which has no separate rows) removes the whole row.
      const removeRow = delThis || delPast;
      if (removeRow) {
        const res = await fetch(`/api/tasks/${current.id}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error || `Delete failed (${res.status})`);
        }
      } else if (delFuture) {
        // End the recurrence: clear the pattern, keep this occurrence.
        const res = await fetch(`/api/tasks/${current.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ recurring_pattern: null, is_recurring: false }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error || `Update failed (${res.status})`);
        }
      }
      setRecurringDeleteOpen(false);
      if (removeRow) {
        dropCurrent();
      } else {
        // Recurrence ended but task remains; reflect that locally and advance.
        setTasks((prev) =>
          prev.map((t) =>
            t.id === current.id
              ? { ...t, isRecurring: false, recurringPattern: null }
              : t
          )
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }, [current, delThis, delFuture, delPast, dropCurrent]);

  // Open the project-delete confirmation (type-to-confirm).
  const requestDeleteProject = useCallback(() => {
    if (!current?.projectId) return;
    setProjectNameConfirm("");
    setConfirmDeleteProjectOpen(true);
  }, [current]);

  // Soft-delete the whole project (and its tasks) via the trash/soft-delete path,
  // then drop all of that project's tasks from the local queue.
  const softDeleteProject = useCallback(async () => {
    if (!current?.projectId) return;
    const projectId = current.projectId;
    setDeletingProject(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `Delete failed (${res.status})`);
      }
      // Remove every queued task belonging to the deleted project.
      setTasks((prev) => {
        const removedIds = new Set(
          prev.filter((t) => t.projectId === projectId).map((t) => t.id)
        );
        setSuggestions((s) => {
          const next = { ...s };
          for (const id of removedIds) delete next[id];
          return next;
        });
        const remaining = prev.filter((t) => t.projectId !== projectId);
        // Keep the index valid against the shrunken list.
        setIndex((i) => Math.max(0, Math.min(i, remaining.length - 1)));
        return remaining;
      });
      setValue(null);
      setConfirmDeleteProjectOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingProject(false);
    }
  }, [current]);

  const projectConfirmMatches =
    Boolean(current?.projectName) &&
    projectNameConfirm.trim() === (current?.projectName ?? "").trim();

  // Keyboard shortcuts: Enter saves, S skips, Esc closes, "U" uses AI suggestion.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      // Don't steal keys while a delete confirmation is open.
      if (confirmDeleteOpen || recurringDeleteOpen || confirmDeleteProjectOpen)
        return;
      if (e.target && (e.target as HTMLElement).tagName === "INPUT") {
        // Let Enter still save when focused in the minute input.
        if (e.key === "Enter") {
          e.preventDefault();
          saveCurrent();
        }
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        saveCurrent();
      } else if (e.key.toLowerCase() === "s") {
        advance();
      } else if (e.key.toLowerCase() === "u" && currentSuggestion) {
        setValue(currentSuggestion.minutes);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goTo(index - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goTo(index + 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    isOpen,
    saveCurrent,
    advance,
    currentSuggestion,
    goTo,
    index,
    confirmDeleteOpen,
    recurringDeleteOpen,
    confirmDeleteProjectOpen,
  ]);

  // When we run off the end of the batch, close out.
  useEffect(() => {
    if (isOpen && tasks.length > 0 && index >= tasks.length) {
      // small delay so the user sees the final state for a beat
      const t = setTimeout(() => finish(), 200);
      return () => clearTimeout(t);
    }
  }, [isOpen, tasks.length, index, finish]);

  const due = useMemo(() => fmtDue(current?.dueDate), [current?.dueDate]);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(o) => {
        if (!o) finish();
      }}
    >
      <DialogContent
        windowTitle="Estimate tasks"
        className="bg-zinc-900 border-zinc-800 max-w-xl [&>button.absolute]:rounded-full [&>button.absolute]:border [&>button.absolute]:border-zinc-700 [&>button.absolute]:bg-zinc-800 [&>button.absolute]:p-1.5 [&>button.absolute]:text-zinc-300 [&>button.absolute]:opacity-100 [&>button.absolute]:transition-colors [&>button.absolute]:hover:border-zinc-500 [&>button.absolute]:hover:bg-zinc-700 [&>button.absolute]:hover:text-white">
        <DialogHeader>
          <DialogTitle>
            <span className="inline-flex items-center gap-2 text-white">
              Estimate tasks
              <EstimateHelpButton onClick={() => setHelpOpen(true)} />
            </span>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex items-center justify-center text-zinc-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading tasks…
          </div>
        ) : tasks.length === 0 ? (
          <div className="py-12 text-center text-zinc-400">
            <Sparkles className="w-6 h-6 mx-auto mb-3 text-zinc-500" />
            All caught up — no unestimated tasks.
          </div>
        ) : !current ? null : (
          <div className="space-y-4">
            {/* Task card */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
              <div className="text-xs text-zinc-500 mb-1 flex items-center gap-2">
                {current.organizationName && (
                  <>
                    <span>{current.organizationName}</span>
                    <ChevronRight className="w-3 h-3" />
                  </>
                )}
                {current.projectName && <span>{current.projectName}</span>}
              </div>
              <div className="text-base text-white font-medium leading-snug">
                {current.name}
              </div>
              {current.description && (
                <div className="mt-2 text-sm text-zinc-400 line-clamp-3 whitespace-pre-wrap">
                  {current.description}
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                {current.priority != null && (
                  <span
                    className={`inline-flex items-center gap-1 ${
                      PRIORITY_COLOR[current.priority] ?? "text-zinc-400"
                    }`}
                  >
                    <Flag className="w-3 h-3" />P{current.priority}
                  </span>
                )}
                {due && (
                  <span className="inline-flex items-center gap-1 text-zinc-400">
                    <Calendar className="w-3 h-3" />
                    {due}
                  </span>
                )}
                {isRecurring && (
                  <span className="inline-flex items-center gap-1 text-[rgb(var(--theme-primary-rgb))]">
                    <Repeat className="w-3 h-3" />
                    Recurring
                  </span>
                )}
                {current.subtaskCount && current.subtaskCount > 0 ? (
                  <span className="text-zinc-500">
                    {current.subtaskCount} subtask{current.subtaskCount === 1 ? "" : "s"}
                  </span>
                ) : null}
                {current.tags?.slice(0, 4).map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-zinc-800 text-zinc-300 px-2 py-0.5"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {/* AI suggestion */}
            <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
              <div className="flex items-center gap-2 text-sm">
                <Sparkles className="w-4 h-4 text-[rgb(var(--theme-primary-rgb))]" />
                {suggestionsLoading && !currentSuggestion ? (
                  <span className="text-zinc-400 inline-flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Thinking…
                  </span>
                ) : currentSuggestion ? (
                  <span className="text-zinc-200">
                    <span className="font-semibold">{currentSuggestion.minutes}m</span>
                    <span className="text-zinc-500"> · {CONFIDENCE_LABEL[currentSuggestion.confidence]}</span>
                    {currentSuggestion.rationale && (
                      <span className="text-zinc-500 italic"> · {currentSuggestion.rationale}</span>
                    )}
                  </span>
                ) : (
                  <span className="text-zinc-500">No suggestion</span>
                )}
              </div>
              {currentSuggestion && (
                <button
                  type="button"
                  onClick={() => setValue(currentSuggestion.minutes)}
                  className="text-xs rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-zinc-200 hover:border-zinc-500"
                  title="Use suggestion (U)"
                >
                  Use
                </button>
              )}
            </div>

            {/* Presets */}
            <EstimatePresets
              value={value}
              onChange={setValue}
              extended
              showInput
            />

            {error && (
              <div className="text-xs text-red-400">{error}</div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                {/* Destructive: delete the current task */}
                <button
                  type="button"
                  onClick={requestDelete}
                  disabled={saving || deleting || deletingProject}
                  className="group relative rounded-md border border-red-500/40 bg-red-500/10 p-1.5 text-red-400 transition-colors hover:border-red-500/70 hover:bg-red-500/20 hover:text-red-300 disabled:opacity-50"
                  aria-label="Delete task"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="pointer-events-none absolute bottom-full left-0 mb-1.5 whitespace-nowrap rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 opacity-0 transition-opacity group-hover:opacity-100">
                    {isRecurring ? "Delete recurring task" : "Delete task"}
                  </span>
                </button>

                {/* Destructive: delete the associated project */}
                {current.projectId && (
                  <button
                    type="button"
                    onClick={requestDeleteProject}
                    disabled={saving || deleting || deletingProject}
                    className="group relative rounded-md border border-red-500/40 bg-red-500/10 p-1.5 text-red-400 transition-colors hover:border-red-500/70 hover:bg-red-500/20 hover:text-red-300 disabled:opacity-50"
                    aria-label="Delete project"
                  >
                    <FolderX className="w-4 h-4" />
                    <span className="pointer-events-none absolute bottom-full left-0 mb-1.5 whitespace-nowrap rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-200 opacity-0 transition-opacity group-hover:opacity-100">
                      Delete project
                    </span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={saveCurrent}
                  disabled={value == null || saving}
                  className="text-sm rounded-md bg-theme-gradient text-white px-3 py-1.5 hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1"
                  title={
                    index >= tasks.length - 1
                      ? "Save (Enter)"
                      : "Approve & Continue (Enter)"
                  }
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  {index >= tasks.length - 1 ? "Save" : "Approve & Continue"}
                </button>
              </div>
            </div>

            {/* Pagination — navigate without saving */}
            <div className="flex items-center justify-center gap-2 border-t border-zinc-800 pt-3">
              <button
                type="button"
                onClick={() => goTo(index - 1)}
                disabled={index <= 0}
                className="rounded-md border border-zinc-700 bg-zinc-800 p-1.5 text-zinc-300 hover:border-zinc-500 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Previous task (doesn't save)"
                aria-label="Previous task"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                <input
                  type="number"
                  min={1}
                  max={tasks.length}
                  value={pageInput ?? String(Math.min(index + 1, tasks.length))}
                  onChange={(e) => setPageInput(e.target.value)}
                  onBlur={() => {
                    if (pageInput != null) {
                      const n = parseInt(pageInput, 10);
                      if (!Number.isNaN(n)) goTo(n - 1);
                      setPageInput(null);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.stopPropagation();
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  className="w-12 rounded-md border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-center text-zinc-200 focus:border-zinc-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  aria-label="Jump to task"
                />
                <span>/ {tasks.length}</span>
              </div>
              <button
                type="button"
                onClick={() => goTo(index + 1)}
                disabled={index >= tasks.length - 1}
                className="rounded-md border border-zinc-700 bg-zinc-800 p-1.5 text-zinc-300 hover:border-zinc-500 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Next task (doesn't save)"
                aria-label="Next task"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Hidden ref retained to silence unused-var; could be wired to focus input on advance */}
        <input ref={inputRef} className="hidden" />
      </DialogContent>

      {/* Non-recurring: simple themed confirm */}
      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={(o) => !deleting && setConfirmDeleteOpen(o)}
        title="Delete task?"
        description={
          current
            ? `"${current.name}" will be moved to trash. You can restore it from there.`
            : undefined
        }
        confirmLabel="Delete"
        destructive
        isLoading={deleting}
        onConfirm={softDeleteCurrent}
      />

      {/* Recurring: multi-choice scope dialog */}
      <Dialog
        open={recurringDeleteOpen}
        onOpenChange={(o) => !deleting && setRecurringDeleteOpen(o)}
      >
        {/* Destructive confirmation — not minimizable (see confirm-modal). */}
        <DialogContent
          className="bg-zinc-900 border-zinc-800 max-w-md"
          minimizable={false}
        >
          <DialogHeader>
            <DialogTitle className="text-white">Delete recurring task</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">
              {current?.name
                ? `"${current.name}" repeats. Choose what to delete.`
                : "This task repeats. Choose what to delete."}
            </p>
            <div className="space-y-2">
              {[
                {
                  key: "past" as const,
                  label: "Past instances",
                  hint: "Removes the recurring task and its history",
                  checked: delPast,
                  set: setDelPast,
                },
                {
                  key: "this" as const,
                  label: "This task",
                  hint: "Deletes the entire recurring task",
                  checked: delThis,
                  set: setDelThis,
                },
                {
                  key: "future" as const,
                  label: "Future instances",
                  hint: "Ends the recurrence, keeps this occurrence",
                  checked: delFuture,
                  set: setDelFuture,
                },
              ].map((opt) => (
                <label
                  key={opt.key}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 transition-colors hover:border-zinc-700"
                >
                  <input
                    type="checkbox"
                    checked={opt.checked}
                    onChange={(e) => opt.set(e.target.checked)}
                    disabled={deleting}
                    className="mt-0.5 h-4 w-4 rounded border-zinc-600 bg-zinc-800 accent-red-500"
                  />
                  <span className="flex flex-col">
                    <span className="text-sm text-zinc-100">{opt.label}</span>
                    <span className="text-xs text-zinc-500">{opt.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            {(delThis || delPast) && delFuture && (
              <p className="text-xs text-amber-400/80">
                Deleting this task removes the whole recurring task, so ending
                future instances has no additional effect.
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRecurringDeleteOpen(false)}
              disabled={deleting}
              className="border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={recurringDeleteCurrent}
              disabled={deleting || (!delThis && !delFuture && !delPast)}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Project delete: type-to-confirm */}
      <Dialog
        open={confirmDeleteProjectOpen}
        onOpenChange={(o) => !deletingProject && setConfirmDeleteProjectOpen(o)}
      >
        {/* Destructive confirmation — not minimizable (see confirm-modal). */}
        <DialogContent
          className="bg-zinc-900 border-zinc-800 max-w-md"
          minimizable={false}
        >
          <DialogHeader>
            <DialogTitle className="text-white">Delete project?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">
              This will delete{" "}
              <span className="font-semibold text-zinc-100">
                {current?.projectName}
              </span>{" "}
              and all of its tasks. Everything is moved to Trash and can be
              restored from there.
            </p>
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400">
                Type{" "}
                <span className="font-mono text-zinc-200">
                  &quot;{current?.projectName}&quot;
                </span>{" "}
                to confirm
              </label>
              <Input
                autoFocus
                value={projectNameConfirm}
                onChange={(e) => setProjectNameConfirm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && projectConfirmMatches && !deletingProject) {
                    e.preventDefault();
                    softDeleteProject();
                  }
                }}
                disabled={deletingProject}
                placeholder={current?.projectName ?? ""}
                className="bg-zinc-950/60 border-zinc-700 text-zinc-100"
              />
            </div>
            {error && <div className="text-xs text-red-400">{error}</div>}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmDeleteProjectOpen(false)}
              disabled={deletingProject}
              className="border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={softDeleteProject}
              disabled={deletingProject || !projectConfirmMatches}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {deletingProject ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Delete project"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EstimateHelpModal isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
    </Dialog>
  );
}
