"use client";

import { FolderPlus, ListChecks, ListTodo, Plus, Target } from "lucide-react";

/**
 * A "+" creation button that reveals a small slideout menu on hover (or
 * keyboard focus). The primary tap adds a Task; the menu also exposes Task
 * List, Section, and Goal creation without extra buttons. Menu items only
 * render when their handler is supplied.
 */
export function CreateMenuButton({
  onAddTask,
  onAddGoal,
  onAddTaskList,
  onAddSection,
  buttonClassName,
  iconClassName = "h-4 w-4",
  align = "end",
  label = "Create task, list, section, or goal",
}: {
  onAddTask: () => void;
  onAddGoal: () => void;
  onAddTaskList?: () => void;
  onAddSection?: () => void;
  buttonClassName?: string;
  iconClassName?: string;
  align?: "start" | "end";
  label?: string;
}) {
  return (
    <div className="group relative inline-flex focus-within:z-30" data-tutorial-id="create-menu">
      <button
        type="button"
        onClick={onAddTask}
        className={
          buttonClassName ??
          "btn-theme-primary flex items-center justify-center rounded-lg p-2 text-white transition-all"
        }
        aria-haspopup="menu"
        aria-label={label}
      >
        <Plus className={iconClassName} />
      </button>
      {/* pt-1 keeps a hover bridge so the menu doesn't close in the gap. */}
      <div
        className={`invisible absolute top-full z-30 pt-1 opacity-0 transition-all duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 ${
          align === "end" ? "right-0" : "left-0"
        }`}
        role="menu"
      >
        <div className="min-w-[9rem] origin-top translate-y-1 scale-95 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl shadow-black/40 transition-transform duration-150 group-hover:translate-y-0 group-hover:scale-100 group-focus-within:translate-y-0 group-focus-within:scale-100">
          <button
            type="button"
            role="menuitem"
            onClick={onAddTask}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            <ListTodo className="h-4 w-4 text-zinc-400" />
            Task
          </button>
          {onAddTaskList && (
            <button
              type="button"
              role="menuitem"
              onClick={onAddTaskList}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-zinc-800 hover:text-white"
            >
              <ListChecks className="h-4 w-4 text-zinc-400" />
              Task List
            </button>
          )}
          {onAddSection && (
            <button
              type="button"
              role="menuitem"
              onClick={onAddSection}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-zinc-800 hover:text-white"
            >
              <FolderPlus className="h-4 w-4 text-zinc-400" />
              Section
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={onAddGoal}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-200 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            <Target className="h-4 w-4 text-[rgb(var(--theme-primary-rgb))]" />
            Goal
          </button>
        </div>
      </div>
    </div>
  );
}
