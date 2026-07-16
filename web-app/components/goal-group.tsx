"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Circle,
  ListPlus,
  Loader2,
  Plus,
  Target,
  Trash2,
} from "lucide-react";
import { Goal } from "@/lib/types";

/**
 * Shared shell for a goal sub-group: the bordered drop zone plus the goal
 * header row (complete toggle, target icon, inline-rename name, progress
 * count, delete). The task content itself is provided via `children` so the
 * board can render drag cards while the list renders TaskList rows — keeping
 * the goal affordances identical across both layouts.
 */
export function GoalGroupShell({
  goal,
  completedCount,
  totalCount,
  sectionId,
  onTaskDropToGoal,
  onSectionDropToGoal,
  onCompleteGoal,
  onRenameGoal,
  onDeleteGoal,
  onAddTaskToGoal,
  onAddSectionToGoal,
  onAddSubGoal,
  children,
}: {
  goal: Goal;
  completedCount: number;
  totalCount: number;
  sectionId?: string;
  onTaskDropToGoal?: (
    taskId: string,
    goalId: string,
    sectionId?: string,
  ) => void;
  onSectionDropToGoal?: (sectionId: string, goalId: string) => void;
  onCompleteGoal?: (goalId: string, completed: boolean) => void;
  onRenameGoal?: (goalId: string, name: string) => void;
  onDeleteGoal?: (goalId: string) => void;
  onAddTaskToGoal?: (goalId: string) => void;
  onAddSectionToGoal?: (goalId: string) => void;
  onAddSubGoal?: (goalId: string) => void;
  children: React.ReactNode;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(goal.name);
  const isSaving = goal._saving === true;

  const commitRename = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== goal.name) {
      onRenameGoal?.(goal.id, trimmed);
    } else {
      setEditValue(goal.name);
    }
    setIsEditing(false);
  };

  return (
    <div
      className={`group/goal mt-2 rounded-lg border transition-colors ${
        isDragOver
          ? "border-[rgb(var(--theme-primary-rgb))] bg-[rgb(var(--theme-primary-rgb))]/10"
          : "border-zinc-800 bg-zinc-950/40"
      } ${isSaving ? "animate-breathe" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragOver(false);
        const droppedSectionId = event.dataTransfer.getData("sectionId");
        if (droppedSectionId) {
          // A section can't be dropped into itself or its own goal.
          if (droppedSectionId !== sectionId) {
            onSectionDropToGoal?.(droppedSectionId, goal.id);
          }
          return;
        }
        const taskId = event.dataTransfer.getData("taskId");
        if (taskId) onTaskDropToGoal?.(taskId, goal.id, sectionId);
      }}
    >
      <div className="flex items-center gap-2 px-2 py-2">
        <button
          type="button"
          onClick={() => onCompleteGoal?.(goal.id, !goal.completed)}
          className={`shrink-0 transition-colors hover:text-white ${
            goal.completed ? "text-green-500" : "text-zinc-400"
          }`}
          title={goal.completed ? "Mark goal incomplete" : "Mark goal complete"}
          aria-label={
            goal.completed ? "Mark goal incomplete" : "Mark goal complete"
          }
        >
          {goal.completed ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Circle className="h-4 w-4" />
          )}
        </button>
        <Target className="h-3.5 w-3.5 shrink-0 text-[rgb(var(--theme-primary-rgb))]" />
        {isEditing ? (
          <input
            type="text"
            value={editValue}
            autoFocus
            onChange={(event) => setEditValue(event.target.value)}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitRename();
              if (event.key === "Escape") {
                setEditValue(goal.name);
                setIsEditing(false);
              }
            }}
            className="min-w-0 flex-1 rounded bg-zinc-800 px-1.5 py-0.5 text-sm text-white focus:outline-none focus:ring-2 ring-theme"
          />
        ) : (
          <button
            type="button"
            onDoubleClick={() => {
              setEditValue(goal.name);
              setIsEditing(true);
            }}
            className={`min-w-0 flex-1 truncate text-left text-sm font-medium ${
              goal.completed ? "text-green-500 line-through" : "text-zinc-200"
            }`}
            title="Double-click to rename"
          >
            {goal.name}
          </button>
        )}
        {isSaving ? (
          <span
            className="flex shrink-0 items-center gap-1 text-xs text-[rgb(var(--theme-primary-rgb))]"
            aria-live="polite"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Saving…
          </span>
        ) : (
          <span className="shrink-0 text-xs text-zinc-500">
            {completedCount}/{totalCount}
          </span>
        )}
        <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/goal:opacity-100">
          {onAddTaskToGoal && (
            <button
              type="button"
              onClick={() => onAddTaskToGoal(goal.id)}
              className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
              title="Add task to goal"
              aria-label="Add task to goal"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
          {onAddSectionToGoal && (
            <button
              type="button"
              onClick={() => onAddSectionToGoal(goal.id)}
              className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
              title="Add task list to goal"
              aria-label="Add task list to goal"
            >
              <ListPlus className="h-3.5 w-3.5" />
            </button>
          )}
          {onAddSubGoal && (
            <button
              type="button"
              onClick={() => onAddSubGoal(goal.id)}
              className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
              title="Add sub-goal"
              aria-label="Add sub-goal"
            >
              <Target className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          type="button"
          disabled={isSaving}
          onClick={() => {
            if (
              confirm(
                `Delete goal "${goal.name}"? Its tasks move back to the section.`,
              )
            ) {
              onDeleteGoal?.(goal.id);
            }
          }}
          className="shrink-0 rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
          title="Delete goal"
          aria-label="Delete goal"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-2 px-2 pb-2">{children}</div>
    </div>
  );
}
