"use client";

import { useCallback, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TaskModal } from "./task-modal";
import { Database, Task } from "@/lib/types";

interface TaskModalStackProps {
  isOpen: boolean;
  onClose: () => void;
  data: Database;
  /** Root task being edited; omit for the add-task flow. */
  task?: Task | null;
  onSave: (
    taskData: Omit<Task, "id" | "createdAt" | "updatedAt"> | Partial<Task>,
  ) => Promise<Task | null> | void;
  onDelete?: (taskId: string) => void;
  onDataRefresh?: () => void;
  defaultProjectId?: string;
  defaultSectionId?: string;
  defaultGoalId?: string;
  onTaskSelect?: (task: Task) => void;
}

/**
 * Drill-down stack for subtasks: expanding a subtask pushes its own task modal
 * on top of the current one, so a subtask can be given subtasks of its own to
 * arbitrary depth. Cards are offset behind the active one and the header pages
 * back and forward through the trail.
 *
 * Expanding an unsaved subtask has to save first — a task with no id cannot own
 * children — so the root modal is submitted and the drill-down opens on the
 * saved record.
 */
export function TaskModalStack({
  isOpen,
  onClose,
  data,
  task = null,
  onSave,
  onDelete,
  onDataRefresh,
  defaultProjectId,
  defaultSectionId,
  defaultGoalId,
  onTaskSelect,
}: TaskModalStackProps) {
  // Tasks drilled into, deepest last. The root modal is not in this list.
  const [trail, setTrail] = useState<Task[]>([]);
  // Popped entries kept so "forward" can retrace without re-expanding.
  const [forward, setForward] = useState<Task[]>([]);

  const reset = useCallback(() => {
    setTrail([]);
    setForward([]);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  /** Latest copy of a trail entry, so edits made deeper are reflected. */
  const freshen = useCallback(
    (entry: Task) => data.tasks?.find((t) => t.id === entry.id) || entry,
    [data.tasks],
  );

  const pushSubtask = useCallback((subtask: Task) => {
    setTrail((prev) => [...prev, subtask]);
    setForward([]);
  }, []);

  const goBack = useCallback(() => {
    setTrail((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice(0, -1);
      setForward((f) => [prev[prev.length - 1], ...f]);
      return next;
    });
  }, []);

  const goForward = useCallback(() => {
    setForward((prev) => {
      if (prev.length === 0) return prev;
      setTrail((t) => [...t, prev[0]]);
      return prev.slice(1);
    });
  }, []);

  if (!isOpen) return null;

  const depth = trail.length;
  const activeTask = depth > 0 ? freshen(trail[depth - 1]) : task;
  // Root sits at the back; each level forward gains z-index and un-offsets.
  const activeZIndex = 60 + depth * 10;

  const pager =
    depth > 0 || forward.length > 0 ? (
      <div className="flex items-center gap-1 text-xs text-zinc-400">
        <button
          type="button"
          onClick={goBack}
          disabled={depth === 0}
          className="rounded p-1 transition-colors hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Back to the parent task"
          title="Back"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="tabular-nums" aria-live="polite">
          {depth + 1} / {depth + 1 + forward.length}
        </span>
        <button
          type="button"
          onClick={goForward}
          disabled={forward.length === 0}
          className="rounded p-1 transition-colors hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Forward to the subtask"
          title="Forward"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    ) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative flex h-full w-full items-center justify-center">
        {/* Cards behind the active one, offset so the stack reads as a deck. */}
        {Array.from({ length: depth }).map((_, index) => (
          <div
            key={`card-${index}`}
            aria-hidden
            className="pointer-events-none absolute rounded-lg border border-zinc-800 bg-zinc-900/80"
            style={{
              zIndex: 60 + index * 10,
              width: "min(48rem, 92vw)",
              height: "min(80vh, 44rem)",
              transform: `translateX(${(depth - index) * -10}px) translateY(${
                (depth - index) * 8
              }px) scale(${1 - (depth - index) * 0.02})`,
            }}
          />
        ))}

        <TaskModal
          key={activeTask?.id || "root"}
          isOpen
          onClose={depth > 0 ? goBack : handleClose}
          data={data}
          task={activeTask}
          onSave={async (taskData) => {
            const saved = await onSave(taskData);
            if (depth === 0) reset();
            return saved ?? null;
          }}
          onDelete={onDelete}
          onDataRefresh={onDataRefresh}
          defaultProjectId={defaultProjectId}
          defaultSectionId={defaultSectionId}
          defaultGoalId={defaultGoalId}
          onTaskSelect={onTaskSelect}
          onExpandSubtask={pushSubtask}
          onRequestSaveForExpand={
            // Only meaningful at the root: a nested modal is already editing a
            // saved task, so its subtasks can be expanded directly.
            depth === 0 && !task
              ? async (taskData) => (await onSave(taskData)) ?? null
              : undefined
          }
          stackHeaderExtra={pager}
          renderInStack
          stackZIndex={activeZIndex}
        />
      </div>
    </div>
  );
}
