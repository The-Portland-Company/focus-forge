"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  X,
  Loader2,
  Wand2,
  History,
  ArrowRight,
  RotateCcw,
  CheckCircle2,
} from "lucide-react";
import {
  MODAL_INSET_CLASS,
  ModalMinimizeButton,
  ModalResizeHandle,
  useModalWindow,
} from "@/components/ui/modal-window";

/**
 * "Reorganize misfiled tasks" — a reusable modal available on any project.
 *
 * Tab 1 (Reorganize): AI proposes a better-fit project for each open task in
 * this project. The user cherry-picks (multi-select + select-all) and applies;
 * every apply is recorded as a restorable batch.
 *
 * Tab 2 (History): lists past reorg batches and lets the user cherry-pick moves
 * to roll back (multi-select + bulk select), restoring tasks to where they were.
 */

type ProposalItem = {
  taskId: string;
  name: string;
  suggestedProjectId: string | null;
  suggestedProjectName: string | null;
  reason: string;
  confidence: number;
};

type ReorgMove = {
  id: string;
  task_id: string;
  before_project_id: string | null;
  after_project_id: string | null;
  reason: string | null;
  confidence: number | null;
  restored: boolean;
};

type ReorgBatch = {
  id: string;
  project_id: string | null;
  created_at: string;
  summary: unknown;
  status: string;
  moves: ReorgMove[];
};

interface ProjectRef {
  id: string;
  name: string;
}

interface ReorganizeTasksModalProps {
  isOpen: boolean;
  projectId: string;
  projectName: string;
  projects: ProjectRef[];
  onClose: () => void;
  /** Called after a successful apply or rollback so the caller can refetch. */
  onChanged?: () => void;
}

export function ReorganizeTasksModal({
  isOpen,
  projectId,
  projectName,
  projects,
  onClose,
  onChanged,
}: ReorganizeTasksModalProps) {
  const modalWindow = useModalWindow({
    title: "Reorganize tasks",
    onRequestClose: onClose,
  });

  const [tab, setTab] = useState<"reorganize" | "history">("reorganize");

  // --- Reorganize tab state ---
  const [loadingProposal, setLoadingProposal] = useState(false);
  const [proposal, setProposal] = useState<ProposalItem[] | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(
    new Set(),
  );
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // --- History tab state ---
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [batches, setBatches] = useState<ReorgBatch[]>([]);
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [selectedMoveIds, setSelectedMoveIds] = useState<Set<string>>(
    new Set(),
  );
  const [restoring, setRestoring] = useState(false);

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) map.set(p.id, p.name);
    return map;
  }, [projects]);

  const suggestable = useMemo(
    () => (proposal || []).filter((p) => p.suggestedProjectId),
    [proposal],
  );

  const runProposal = useCallback(async () => {
    setLoadingProposal(true);
    setError(null);
    setApplyResult(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/reorganize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "Could not analyze this project's tasks.");
        setProposal([]);
        return;
      }
      const items: ProposalItem[] = Array.isArray(data?.proposal)
        ? data.proposal
        : [];
      setProposal(items);
      // Pre-select every task that has a suggestion.
      setSelectedTaskIds(
        new Set(
          items.filter((i) => i.suggestedProjectId).map((i) => i.taskId),
        ),
      );
    } catch {
      setError("Could not analyze this project's tasks.");
      setProposal([]);
    } finally {
      setLoadingProposal(false);
    }
  }, [projectId]);

  const loadBatches = useCallback(async () => {
    setLoadingBatches(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/reorganize/batches`,
        { credentials: "include" },
      );
      const data = await res.json().catch(() => null);
      setBatches(Array.isArray(data?.batches) ? data.batches : []);
    } catch {
      setBatches([]);
    } finally {
      setLoadingBatches(false);
    }
  }, [projectId]);

  // Kick off the proposal when the modal first opens on the reorganize tab.
  useEffect(() => {
    if (!isOpen) return;
    if (tab === "reorganize" && proposal === null && !loadingProposal) {
      void runProposal();
    }
    if (tab === "history") {
      void loadBatches();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, tab]);

  const toggleTask = (taskId: string) =>
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });

  const allSuggestableSelected =
    suggestable.length > 0 && selectedTaskIds.size === suggestable.length;

  const toggleSelectAllTasks = () =>
    setSelectedTaskIds(
      allSuggestableSelected
        ? new Set()
        : new Set(suggestable.map((i) => i.taskId)),
    );

  const applyMoves = async () => {
    if (selectedTaskIds.size === 0) return;
    setApplying(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/reorganize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          apply: true,
          taskIds: Array.from(selectedTaskIds),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "Could not move the selected tasks.");
        return;
      }
      setApplyResult(
        `Moved ${data?.movedCount ?? 0} task${
          (data?.movedCount ?? 0) === 1 ? "" : "s"
        }. You can undo this from History.`,
      );
      setProposal(null);
      setSelectedTaskIds(new Set());
      onChanged?.();
    } catch {
      setError("Could not move the selected tasks.");
    } finally {
      setApplying(false);
    }
  };

  const movesForExpanded = useMemo(() => {
    const batch = batches.find((b) => b.id === expandedBatchId);
    return batch ? batch.moves.filter((m) => !m.restored) : [];
  }, [batches, expandedBatchId]);

  const toggleMove = (moveId: string) =>
    setSelectedMoveIds((prev) => {
      const next = new Set(prev);
      if (next.has(moveId)) next.delete(moveId);
      else next.add(moveId);
      return next;
    });

  const allMovesSelected =
    movesForExpanded.length > 0 &&
    movesForExpanded.every((m) => selectedMoveIds.has(m.id));

  const toggleSelectAllMoves = () =>
    setSelectedMoveIds(
      allMovesSelected
        ? new Set()
        : new Set(movesForExpanded.map((m) => m.id)),
    );

  const restoreSelected = async (batchId: string) => {
    if (selectedMoveIds.size === 0) return;
    setRestoring(true);
    try {
      const res = await fetch(
        `/api/reorganize/batches/${batchId}/rollback`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ moveIds: Array.from(selectedMoveIds) }),
        },
      );
      if (res.ok) {
        setSelectedMoveIds(new Set());
        await loadBatches();
        onChanged?.();
      }
    } finally {
      setRestoring(false);
    }
  };

  const nameFor = (id: string | null | undefined) =>
    (id && projectNameById.get(id)) || "another project";

  if (!isOpen) return null;
  if (modalWindow.minimized) return null;

  return (
    <div
      className={`fixed ${MODAL_INSET_CLASS} z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm`}
    >
      <div
        ref={modalWindow.panelRef}
        style={{
          ...modalWindow.panelStyle,
          ...modalWindow.sizeStyle,
          position: "relative",
        }}
        className="flex w-full max-w-3xl flex-col rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl max-h-full"
      >
        <div
          {...modalWindow.dragHandleProps}
          aria-hidden
          className="absolute inset-x-0 top-0 z-0 h-12 rounded-t-xl"
        />
        <ModalMinimizeButton
          onMinimize={modalWindow.minimize}
          className="absolute right-12 top-4 z-20"
        />
        <ModalResizeHandle handleProps={modalWindow.resizeHandleProps} />

        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Reorganize tasks
            </h2>
            <p className="text-xs text-zinc-500">{projectName}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-zinc-800 px-3 pt-2">
          {(
            [
              { key: "reorganize", label: "Reorganize", icon: Wand2 },
              { key: "history", label: "History & restore", icon: History },
            ] as const
          ).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`inline-flex items-center gap-2 rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                tab === key
                  ? "border-[rgb(var(--theme-primary-rgb))] text-white"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {error && (
            <div className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          {tab === "reorganize" && (
            <>
              <p className="text-sm text-zinc-400">
                Some tasks may not belong in{" "}
                <span className="text-zinc-200">{projectName}</span>. Review the
                AI&apos;s suggested destinations and move the ones you agree with.
                Every move is logged and can be undone from History.
              </p>

              {applyResult && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  {applyResult}
                </div>
              )}

              {loadingProposal && (
                <div className="flex items-center gap-2 py-8 text-sm text-zinc-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing this project&apos;s tasks…
                </div>
              )}

              {!loadingProposal && proposal && suggestable.length === 0 && (
                <div className="py-8 text-center text-sm text-zinc-500">
                  No misfiled tasks found — everything looks like it belongs
                  here.
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => void runProposal()}
                      className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:text-white"
                    >
                      Re-analyze
                    </button>
                  </div>
                </div>
              )}

              {!loadingProposal && suggestable.length > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
                      <input
                        type="checkbox"
                        checked={allSuggestableSelected}
                        onChange={toggleSelectAllTasks}
                        className="h-4 w-4 rounded border-zinc-600 bg-zinc-800"
                      />
                      Select all ({suggestable.length})
                    </label>
                    <span className="text-xs text-zinc-500">
                      {selectedTaskIds.size} selected
                    </span>
                  </div>

                  <ul className="space-y-2">
                    {suggestable.map((item) => (
                      <li
                        key={item.taskId}
                        className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3"
                      >
                        <input
                          type="checkbox"
                          checked={selectedTaskIds.has(item.taskId)}
                          onChange={() => toggleTask(item.taskId)}
                          className="mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-800"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm text-zinc-200">
                            {item.name}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                            <span className="truncate">{projectName}</span>
                            <ArrowRight className="h-3 w-3 shrink-0" />
                            <span className="truncate font-medium text-[rgb(var(--theme-primary-rgb))]">
                              {item.suggestedProjectName ||
                                nameFor(item.suggestedProjectId)}
                            </span>
                            <span className="ml-1 rounded-full border border-zinc-700 px-1.5 py-0.5">
                              {Math.round((item.confidence || 0) * 100)}%
                            </span>
                          </div>
                          {item.reason && (
                            <div className="mt-1 text-xs text-zinc-500">
                              {item.reason}
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => void runProposal()}
                      disabled={applying}
                      className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:text-white disabled:opacity-50"
                    >
                      Re-analyze
                    </button>
                    <button
                      type="button"
                      onClick={() => void applyMoves()}
                      disabled={applying || selectedTaskIds.size === 0}
                      className="btn-theme-primary inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {applying ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Wand2 className="h-4 w-4" />
                      )}
                      Move {selectedTaskIds.size} selected
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {tab === "history" && (
            <>
              {loadingBatches && (
                <div className="flex items-center gap-2 py-8 text-sm text-zinc-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading history…
                </div>
              )}

              {!loadingBatches && batches.length === 0 && (
                <div className="py-8 text-center text-sm text-zinc-500">
                  No reorganizations yet. Moves you make will appear here so you
                  can undo them.
                </div>
              )}

              {!loadingBatches &&
                batches.map((batch) => {
                  const active = batch.moves.filter((m) => !m.restored);
                  const restoredCount = batch.moves.length - active.length;
                  const isExpanded = expandedBatchId === batch.id;
                  return (
                    <div
                      key={batch.id}
                      className="rounded-lg border border-zinc-800 bg-zinc-950/40"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedBatchId(isExpanded ? null : batch.id);
                          setSelectedMoveIds(new Set());
                        }}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                      >
                        <div className="min-w-0">
                          <div className="text-sm text-zinc-200">
                            {new Date(batch.created_at).toLocaleString()}
                          </div>
                          <div className="text-xs text-zinc-500">
                            {batch.moves.length} move
                            {batch.moves.length === 1 ? "" : "s"}
                            {restoredCount > 0
                              ? ` · ${restoredCount} restored`
                              : ""}
                          </div>
                        </div>
                        <span className="text-xs text-zinc-500">
                          {isExpanded ? "Hide" : "Review"}
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="space-y-2 border-t border-zinc-800 p-3">
                          {active.length === 0 ? (
                            <div className="text-center text-xs text-zinc-500">
                              All moves in this batch have been restored.
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center justify-between">
                                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
                                  <input
                                    type="checkbox"
                                    checked={allMovesSelected}
                                    onChange={toggleSelectAllMoves}
                                    className="h-4 w-4 rounded border-zinc-600 bg-zinc-800"
                                  />
                                  Select all ({active.length})
                                </label>
                                <span className="text-xs text-zinc-500">
                                  {selectedMoveIds.size} selected
                                </span>
                              </div>

                              <ul className="space-y-2">
                                {active.map((move) => (
                                  <li
                                    key={move.id}
                                    className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selectedMoveIds.has(move.id)}
                                      onChange={() => toggleMove(move.id)}
                                      className="mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-800"
                                    />
                                    <div className="min-w-0 flex-1 text-xs">
                                      <div className="flex flex-wrap items-center gap-1.5 text-zinc-400">
                                        <span className="truncate font-medium text-[rgb(var(--theme-primary-rgb))]">
                                          {nameFor(move.after_project_id)}
                                        </span>
                                        <RotateCcw className="h-3 w-3 shrink-0" />
                                        <span className="truncate">
                                          {nameFor(move.before_project_id)}
                                        </span>
                                      </div>
                                      {move.reason && (
                                        <div className="mt-1 text-zinc-500">
                                          {move.reason}
                                        </div>
                                      )}
                                    </div>
                                  </li>
                                ))}
                              </ul>

                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => void restoreSelected(batch.id)}
                                  disabled={
                                    restoring || selectedMoveIds.size === 0
                                  }
                                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {restoring ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <RotateCcw className="h-4 w-4" />
                                  )}
                                  Restore {selectedMoveIds.size} selected
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
