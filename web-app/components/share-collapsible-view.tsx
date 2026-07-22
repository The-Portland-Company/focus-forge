"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { CheckCircle2, Circle } from "lucide-react";
import {
  hasSupplies,
  taskDisplayName,
  type SupplyLike,
} from "@/lib/supply";
import { SupplyLine } from "@/components/supply-line";
import { SupplyTotal } from "@/components/supply-total";
import { ShareSupplyPanel } from "@/components/share-supply-panel";

export type ShareTask = SupplyLike & {
  id: string;
  name: string;
  completed: boolean | null;
  section_id: string | null;
  parent_id: string | null;
};

/**
 * Read-only share view with collapsing. Everything starts collapsed — you see
 * the section headers (and their supply subtotals) and can open the whole
 * thing at once, or drill in section by section and task by task.
 *
 * A client component because the server-rendered variant can't hold the
 * open/closed state; the supply maths still comes from lib/supply so totals
 * match the app.
 */
export function ShareCollapsibleView({
  groups,
  tasks,
}: {
  groups: Array<{ id: string | null; name: string }>;
  tasks: ShareTask[];
}) {
  const childrenByParent = useMemo(() => {
    const map = new Map<string, ShareTask[]>();
    for (const task of tasks) {
      if (!task.parent_id) continue;
      const siblings = map.get(task.parent_id);
      if (siblings) siblings.push(task);
      else map.set(task.parent_id, [task]);
    }
    return map;
  }, [tasks]);

  const knownIds = useMemo(() => new Set(tasks.map((t) => t.id)), [tasks]);
  const isRoot = (task: ShareTask) =>
    !task.parent_id || !knownIds.has(task.parent_id);

  const rootTasksBySection = (sectionId: string | null) =>
    tasks.filter((t) => isRoot(t) && (t.section_id || null) === sectionId);

  const withDescendants = (roots: ShareTask[]): ShareTask[] => {
    const out: ShareTask[] = [];
    const walk = (task: ShareTask) => {
      out.push(task);
      for (const child of childrenByParent.get(task.id) || []) walk(child);
    };
    roots.forEach(walk);
    return out;
  };

  // Everything that can collapse: every group (section) and every task that has
  // children. All of it starts collapsed.
  const collapsibleKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const group of groups) {
      if (rootTasksBySection(group.id).length > 0) {
        keys.add(`section:${group.id ?? "none"}`);
      }
    }
    for (const task of tasks) {
      if ((childrenByParent.get(task.id) || []).length > 0) {
        keys.add(`task:${task.id}`);
      }
    }
    return keys;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, tasks, childrenByParent]);

  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(collapsibleKeys),
  );

  const isCollapsed = (key: string) => collapsed.has(key);
  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const allExpanded = collapsed.size === 0;
  const expandAll = () => setCollapsed(new Set());
  const collapseAll = () => setCollapsed(new Set(collapsibleKeys));

  const renderTask = (task: ShareTask, depth = 0) => {
    const children = childrenByParent.get(task.id) || [];
    const key = `task:${task.id}`;
    const collapsedHere = isCollapsed(key);
    return (
      <li key={task.id}>
        <div
          className={`flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 ${
            task.completed ? "opacity-60" : ""
          }`}
          style={depth > 0 ? { marginLeft: `${depth * 16}px` } : undefined}
        >
          {children.length > 0 ? (
            <button
              type="button"
              onClick={() => toggle(key)}
              aria-label={collapsedHere ? "Expand" : "Collapse"}
              className="shrink-0 text-zinc-500 transition-colors hover:text-white"
            >
              {collapsedHere ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}
          {task.completed ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
          ) : (
            <Circle className="h-4 w-4 shrink-0 text-zinc-600" />
          )}
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
          {children.length > 0 && collapsedHere && (
            <span className="ml-1 shrink-0 text-[11px] text-zinc-600">
              ({children.length})
            </span>
          )}
        </div>
        {children.length > 0 && !collapsedHere && (
          <ul className="mt-1.5 space-y-1.5">
            {children.map((child) => renderTask(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={allExpanded ? collapseAll : expandAll}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:text-white"
        >
          {allExpanded ? (
            <>
              <ChevronRight className="h-3.5 w-3.5" />
              Collapse all
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" />
              Expand all
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-x-6 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
        {groups.map((group) => {
          const roots = rootTasksBySection(group.id);
          if (roots.length === 0) return null;
          const groupTasks = withDescendants(roots);
          const key = `section:${group.id ?? "none"}`;
          const sectionCollapsed = isCollapsed(key);
          return (
            <Fragment key={group.id ?? "no-section"}>
              <section className="lg:col-start-1">
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  className="mb-2 flex w-full items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-zinc-500 transition-colors hover:text-zinc-300"
                >
                  {sectionCollapsed ? (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                  )}
                  {group.name}
                  <span className="font-normal normal-case text-zinc-600">
                    ({roots.length})
                  </span>
                </button>
                {!sectionCollapsed && (
                  <ul className="space-y-1.5">
                    {roots.map((task) => renderTask(task))}
                  </ul>
                )}
              </section>
              <div className="lg:col-start-2 lg:pt-[1.75rem]">
                <ShareSupplyPanel items={groupTasks} />
              </div>
            </Fragment>
          );
        })}
        {tasks.length === 0 && (
          <p className="text-sm text-zinc-500 lg:col-start-1">
            This project has no tasks yet.
          </p>
        )}
        {hasSupplies(tasks) && (
          <div className="sticky bottom-0 z-10 -mx-5 mt-2 border-t border-zinc-800 bg-zinc-950/95 px-5 py-3 backdrop-blur sm:-mx-8 sm:px-8 lg:col-start-2 lg:mx-0 lg:border-t-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none">
            <SupplyTotal items={tasks} label="Supplies total" variant="total" />
          </div>
        )}
      </div>
    </div>
  );
}
