"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { Search, X, Circle, CheckCircle2, Flag } from "lucide-react";
import type { Task } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Badge wrapper for the left-nav org/project task counts. Clicking the count
 * opens a modal listing every task behind that count (with instant search +
 * status/priority filters); hovering shows a lightweight read-only preview of
 * the same list (capped, with a "+N more" hint). Task rows navigate to the
 * owning project page.
 *
 * The task data is sourced from whatever the sidebar already holds (data.tasks)
 * — no new API endpoint. Pass the in-scope tasks (complete AND incomplete); the
 * badge itself shows the incomplete count to match the rest of the nav.
 */

type StatusFilter = "all" | "incomplete" | "complete";
type PriorityFilter = "all" | "1" | "2" | "3" | "4";

const PREVIEW_LIMIT = 10;

const PRIORITY_META: Record<number, { label: string; className: string }> = {
  1: { label: "P1", className: "text-red-500" },
  2: { label: "P2", className: "text-orange-500" },
  3: { label: "P3", className: "text-blue-500" },
  4: { label: "P4", className: "text-muted-foreground" },
};

export function NavTasksBadge({
  name,
  kind,
  tasks,
  projectNameById,
  triggerClassName,
}: {
  name: string;
  kind: "organization" | "project";
  tasks: Task[];
  /** project id → display name, used to label tasks in the org-scoped list */
  projectNameById?: Map<string, string>;
  /** classes for the count trigger (matches the existing badge styling) */
  triggerClassName?: string;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("incomplete");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");

  const incompleteCount = useMemo(
    () => tasks.filter((t) => !t.completed).length,
    [tasks],
  );

  const previewTasks = useMemo(
    () =>
      tasks
        .filter((t) => !t.completed)
        .sort((a, b) => a.priority - b.priority)
        .slice(0, PREVIEW_LIMIT),
    [tasks],
  );
  const previewOverflow = Math.max(
    0,
    tasks.filter((t) => !t.completed).length - previewTasks.length,
  );

  const filteredTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks
      .filter((t) => {
        if (statusFilter === "incomplete" && t.completed) return false;
        if (statusFilter === "complete" && !t.completed) return false;
        if (priorityFilter !== "all" && String(t.priority) !== priorityFilter)
          return false;
        if (q) {
          const haystack = `${t.name} ${t.description || ""}`.toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return a.priority - b.priority;
      });
  }, [tasks, query, statusFilter, priorityFilter]);

  const openTask = (task: Task) => {
    if (task.projectId) {
      setDialogOpen(false);
      router.push(`/project-${task.projectId}`);
    }
  };

  if (incompleteCount <= 0) return null;

  const projectLabel = (task: Task) =>
    kind === "organization" && projectNameById
      ? projectNameById.get(task.projectId)
      : undefined;

  return (
    <>
      <Popover.Root open={hoverOpen} onOpenChange={setHoverOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            onMouseEnter={() => setHoverOpen(true)}
            onMouseLeave={() => setHoverOpen(false)}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setHoverOpen(false);
              setDialogOpen(true);
            }}
            aria-label={`View ${incompleteCount} tasks in ${name}`}
            className={
              triggerClassName ??
              "min-w-[18px] text-right text-xs sm:text-[10px] tabular-nums text-zinc-500 hover:text-zinc-200 transition-colors"
            }
          >
            {incompleteCount}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="right"
            align="start"
            sideOffset={6}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onMouseEnter={() => setHoverOpen(true)}
            onMouseLeave={() => setHoverOpen(false)}
            className="z-[60] w-72 max-w-[min(var(--radix-popper-available-width,100vw),calc(100vw-1rem))] rounded-lg border bg-popover p-2 text-popover-foreground shadow-xl outline-none"
          >
            <div className="px-1 pb-1.5 text-xs sm:text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {name} · {incompleteCount} open
            </div>
            <div className="max-h-64 space-y-0.5 overflow-y-auto">
              {previewTasks.map((task) => {
                const meta = PRIORITY_META[task.priority] || PRIORITY_META[4];
                const label = projectLabel(task);
                return (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1 text-xs"
                  >
                    <Flag className={`h-3 w-3 shrink-0 ${meta.className}`} />
                    <span className="min-w-0 flex-1 truncate">{task.name}</span>
                    {label ? (
                      <span className="shrink-0 truncate text-xs sm:text-[10px] text-muted-foreground">
                        {label}
                      </span>
                    ) : null}
                  </div>
                );
              })}
              {previewOverflow > 0 ? (
                <div className="px-2 py-1 text-xs sm:text-[11px] text-muted-foreground">
                  +{previewOverflow} more
                </div>
              ) : null}
            </div>
            <div className="mt-1 border-t pt-1 text-center text-xs sm:text-[10px] text-muted-foreground">
              Click to open full list
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl" windowTitle={`${name} · ${kind} tasks`}>
          <DialogHeader>
            <DialogTitle className="capitalize">
              {name}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {kind} tasks
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tasks"
                className="h-9 w-full rounded-md border bg-background pl-9 pr-8 text-sm outline-none focus:border-ring"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <FilterGroup
                label="Status"
                value={statusFilter}
                onChange={(v) => setStatusFilter(v as StatusFilter)}
                options={[
                  { value: "all", label: "All" },
                  { value: "incomplete", label: "Incomplete" },
                  { value: "complete", label: "Complete" },
                ]}
              />
              <FilterGroup
                label="Priority"
                value={priorityFilter}
                onChange={(v) => setPriorityFilter(v as PriorityFilter)}
                options={[
                  { value: "all", label: "Any" },
                  { value: "1", label: "P1" },
                  { value: "2", label: "P2" },
                  { value: "3", label: "P3" },
                  { value: "4", label: "P4" },
                ]}
              />
            </div>

            <div className="max-h-80 space-y-0.5 overflow-y-auto">
              {filteredTasks.length === 0 ? (
                <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                  No matching tasks
                </div>
              ) : (
                filteredTasks.map((task) => {
                  const meta = PRIORITY_META[task.priority] || PRIORITY_META[4];
                  const label = projectLabel(task);
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => openTask(task)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                    >
                      {task.completed ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                      ) : (
                        <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span
                        className={`min-w-0 flex-1 truncate ${task.completed ? "text-muted-foreground line-through" : ""}`}
                      >
                        {task.name}
                      </span>
                      {label ? (
                        <span className="shrink-0 truncate text-xs sm:text-[11px] text-muted-foreground">
                          {label}
                        </span>
                      ) : null}
                      <span
                        className={`shrink-0 text-xs sm:text-[10px] font-semibold ${meta.className}`}
                      >
                        {meta.label}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FilterGroup({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-muted-foreground">{label}:</span>
      <div className="flex overflow-hidden rounded-md border">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`px-2 py-1 transition-colors ${
              value === opt.value
                ? "bg-accent font-medium text-foreground"
                : "text-muted-foreground hover:bg-accent/50"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
