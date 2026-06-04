"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EstimatePresets } from "@/components/estimate-presets";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Flag,
  Loader2,
  Sparkles,
} from "lucide-react";

interface UnestimatedTask {
  id: string;
  name: string;
  description?: string | null;
  priority?: number | null;
  dueDate?: string | null;
  projectName?: string | null;
  organizationName?: string | null;
  tags?: string[];
  subtaskCount?: number | null;
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

  const current = tasks[index];
  const currentSuggestion = current ? suggestions[current.id] : undefined;

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

  // Keyboard shortcuts: Enter saves, S skips, Esc closes, "U" uses AI suggestion.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
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
  }, [isOpen, saveCurrent, advance, currentSuggestion, goTo, index]);

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
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-xl [&>button.absolute]:rounded-full [&>button.absolute]:border [&>button.absolute]:border-zinc-700 [&>button.absolute]:bg-zinc-800 [&>button.absolute]:p-1.5 [&>button.absolute]:text-zinc-300 [&>button.absolute]:opacity-100 [&>button.absolute]:transition-colors [&>button.absolute]:hover:border-zinc-500 [&>button.absolute]:hover:bg-zinc-700 [&>button.absolute]:hover:text-white">
        <DialogHeader>
          <DialogTitle>
            <span className="text-white">Estimate tasks</span>
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
            <div className="flex items-center justify-end pt-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={saveCurrent}
                  disabled={value == null || saving}
                  className="text-sm rounded-md bg-[rgb(var(--theme-primary-rgb))] text-white px-3 py-1.5 hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1"
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
    </Dialog>
  );
}
