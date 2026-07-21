"use client";

import { useState } from "react";
import { CheckCircle2, Circle, Loader2, Plus } from "lucide-react";

interface ShareTask {
  id: string;
  name: string;
  completed: boolean | null;
  section_id: string | null;
}

interface ShareGroup {
  id: string | null;
  name: string;
}

/**
 * Interactive task list for read-write share links. Read-only links render the
 * static server markup instead, so this component is only ever mounted when the
 * link actually grants write access — the server re-checks on every request.
 */
export function ShareTaskBoard({
  token,
  groups,
  initialTasks,
}: {
  token: string;
  groups: ShareGroup[];
  initialTasks: ShareTask[];
}) {
  const [tasks, setTasks] = useState<ShareTask[]>(initialTasks);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [addingIn, setAddingIn] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const markPending = (id: string, pending: boolean) =>
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });

  const toggle = async (task: ShareTask) => {
    const nextCompleted = !task.completed;
    setError(null);
    markPending(task.id, true);
    // Flip immediately; roll back if the server rejects it.
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id ? { ...t, completed: nextCompleted } : t,
      ),
    );
    try {
      const res = await fetch(`/api/share/${token}/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: nextCompleted }),
      });
      if (!res.ok) throw new Error(`PATCH failed (${res.status})`);
    } catch {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, completed: task.completed } : t,
        ),
      );
      setError("Could not save that change. The link may have expired.");
    } finally {
      markPending(task.id, false);
    }
  };

  const addTask = async (sectionId: string | null) => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/share/${token}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, section_id: sectionId ?? undefined }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Failed to add task");
      setTasks((prev) => [...prev, payload.task]);
      setNewName("");
      setAddingIn(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add task");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </div>
      )}

      {groups.map((group) => {
        const groupKey = group.id ?? "no-section";
        const groupTasks = tasks.filter(
          (t) => (t.section_id || null) === group.id,
        );
        return (
          <section key={groupKey}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
              {group.name}
            </h2>
            <ul className="space-y-1.5">
              {groupTasks.map((task) => {
                const pending = pendingIds.has(task.id);
                return (
                  <li
                    key={task.id}
                    className={`flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 ${
                      pending ? "animate-breathe" : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(task)}
                      disabled={pending}
                      aria-label={
                        task.completed ? "Mark incomplete" : "Mark complete"
                      }
                      className="shrink-0 text-zinc-500 transition-colors hover:text-white disabled:cursor-not-allowed"
                    >
                      {task.completed ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <Circle className="h-4 w-4" />
                      )}
                    </button>
                    <span
                      className={
                        task.completed
                          ? "text-sm text-zinc-500 line-through"
                          : "text-sm text-zinc-200"
                      }
                    >
                      {task.name}
                    </span>
                  </li>
                );
              })}
            </ul>

            {addingIn === groupKey ? (
              <form
                className="mt-2 flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  addTask(group.id);
                }}
              >
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setAddingIn(null);
                      setNewName("");
                    }
                  }}
                  placeholder="Task name"
                  className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-[rgb(var(--theme-primary-rgb))] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={creating || !newName.trim()}
                  className="rounded-lg bg-theme-gradient px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {creating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Add"
                  )}
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAddingIn(groupKey);
                  setNewName("");
                }}
                className="mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
              >
                <Plus className="h-3.5 w-3.5" /> Add task
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}
