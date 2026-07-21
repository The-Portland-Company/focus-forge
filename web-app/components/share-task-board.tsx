"use client";

import { Fragment, useState } from "react";
import { CheckCircle2, Circle, Loader2, Plus } from "lucide-react";
import { SupplyTotal } from "./supply-total";
import { ShareSupplyPanel } from "./share-supply-panel";
import { SupplyLine } from "./supply-line";
import { taskDisplayName } from "@/lib/supply";

interface ShareTask {
  id: string;
  name: string;
  completed: boolean | null;
  section_id: string | null;
  parent_id?: string | null;
  is_supply?: boolean | null;
  supply_quantity?: number | string | null;
  supply_price?: number | string | null;
  supply_vendor?: string | null;
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

  // Subtasks nest under their parent rather than sitting beside it. A child
  // may carry a different section_id (or none) from its parent, so grouping is
  // driven by root tasks and children follow their parent — mirrors the
  // read-only share view so the same link nests identically either way.
  const childrenByParent = new Map<string, ShareTask[]>();
  for (const task of tasks) {
    const parentId = task.parent_id;
    if (!parentId) continue;
    const siblings = childrenByParent.get(parentId);
    if (siblings) siblings.push(task);
    else childrenByParent.set(parentId, [task]);
  }
  const knownIds = new Set(tasks.map((t) => t.id));
  // A task whose parent is missing would never render as a child, so promote it.
  const isRoot = (task: ShareTask) =>
    !task.parent_id || !knownIds.has(task.parent_id);

  /** A task plus every descendant, so a section's supplies include subtasks. */
  const withDescendants = (roots: ShareTask[]): ShareTask[] => {
    const out: ShareTask[] = [];
    const walk = (task: ShareTask) => {
      out.push(task);
      for (const child of childrenByParent.get(task.id) || []) walk(child);
    };
    roots.forEach(walk);
    return out;
  };

  const renderTask = (task: ShareTask, depth = 0): React.ReactNode => {
    const pending = pendingIds.has(task.id);
    const children = childrenByParent.get(task.id) || [];
    return (
      <li key={task.id}>
        <div
          className={`flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 ${
            pending ? "animate-breathe" : ""
          }`}
          style={depth > 0 ? { marginLeft: `${depth * 16}px` } : undefined}
        >
          <button
            type="button"
            onClick={() => toggle(task)}
            disabled={pending}
            aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
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
            {taskDisplayName(task, task.name)}
          </span>
          <SupplyLine task={task} />
        </div>
        {children.length > 0 && (
          <ul className="mt-1.5 space-y-1.5">
            {children.map((child) => renderTask(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="grid grid-cols-1 items-start gap-x-6 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300 lg:col-span-2"
        >
          {error}
        </div>
      )}

      {/* Totals bracket the list, top and bottom, and update live as tasks
          are ticked off or added. */}
      <div className="lg:col-start-2">
        <SupplyTotal items={tasks} label="Supplies total" variant="total" />
      </div>

      {groups.map((group) => {
        const groupKey = group.id ?? "no-section";
        const roots = tasks.filter(
          (t) => isRoot(t) && (t.section_id || null) === group.id,
        );
        const groupTasks = withDescendants(roots);
        return (
          <Fragment key={groupKey}>
            <section className="lg:col-start-1">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
              {group.name}
            </h2>
            <ul className="space-y-1.5">
              {roots.map((task) => renderTask(task))}
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
            {/* Pushed down by the section heading's height so the panel sits
                level with the first task rather than the title. */}
            <div className="lg:col-start-2 lg:pt-[1.75rem]">
              <ShareSupplyPanel items={groupTasks} />
            </div>
          </Fragment>
        );
      })}

      <div className="lg:col-start-2">
        <SupplyTotal items={tasks} label="Supplies total" variant="total" />
      </div>
    </div>
  );
}
