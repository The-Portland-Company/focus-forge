"use client";

import { ListTodo, Plus, Target } from "lucide-react";

/**
 * A "+" creation button that reveals a small slideout menu on hover (or
 * keyboard focus) offering two actions: Task and Goal. Keeps the single-tap
 * affordance discoverable while exposing goal creation without a second
 * button.
 */
export function CreateMenuButton({
  onAddTask,
  onAddGoal,
  buttonClassName,
  iconClassName = "h-4 w-4",
  align = "end",
  label = "Create task or goal",
}: {
  onAddTask: () => void;
  onAddGoal: () => void;
  buttonClassName?: string;
  iconClassName?: string;
  align?: "start" | "end";
  label?: string;
}) {
  return (
    <div className="group relative inline-flex focus-within:z-30">
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
