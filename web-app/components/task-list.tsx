"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import { Task, Project } from "@/lib/types";
import {
  Circle,
  CheckCircle2,
  Calendar,
  CalendarX2,
  Clock,
  Flag,
  Trash2,
  Edit,
  ChevronRight,
  ChevronDown,
  Link2,
  AlertCircle,
  Repeat2,
  Hash,
  Square,
  CheckSquare,
  Loader2,
  AlignLeft,
  MessageCircle,
  Mail,
  StickyNote,
} from "lucide-react";
import { format, addDays } from "date-fns";
import { getStartOfDay, isToday, isOverdue } from "@/lib/date-utils";
import { formatRecurringLabel } from "@/lib/recurring-utils";
import { getBlockedTaskIds, getBlockingTasks } from "@/lib/dependency-utils";
import { UserAvatar } from "@/components/user-avatar";
import * as Popover from "@radix-ui/react-popover";

interface TaskListProps {
  tasks: Task[];
  allTasks?: Task[]; // For dependency checking
  projects?: Project[]; // For showing project names
  tags?: Task["tagBadges"];
  currentUserId?: string; // For hiding "me" avatar
  priorityColor?: string; // User's custom priority color (defaults to green)
  showCompleted?: boolean;
  completedAccordionKey?: string; // localStorage key for persisting completed state
  revealActionsOnHover?: boolean;
  uniformDueBadgeWidth?: boolean;
  dueDateLayout?: "inline" | "below" | "right";
  bulkSelectMode?: boolean;
  selectedTaskIds?: Set<string>;
  loadingTaskIds?: Set<string>; // Tasks currently being processed
  animatingOutTaskIds?: Set<string>; // Tasks animating out after processing
  optimisticCompletedIds?: Set<string>; // Tasks optimistically marked as completed
  deletingTaskIds?: Set<string>; // Tasks currently being deleted (loader + breathe)
  savingTaskIds?: Set<string>; // Tasks whose edit is being saved in the background (spinner)
  recentlySavedTaskIds?: Set<string>; // Tasks that just saved successfully (fading green check)
  freshlyUpdatedTaskIds?: Set<string>; // Tasks new/changed from a background refetch (fading green row)
  emailThreadIdByTaskId?: Record<string, string>; // task id -> linked email thread id
  onOpenEmailThread?: (threadId: string) => void;
  onAddDependency?: (task: Task) => void;
  showDescriptions?: boolean; // show description excerpts under all tasks
  enableDueDateQuickEdit?: boolean;
  onTaskFocus?: (taskId: string) => void;
  onTaskUpdate?: (
    taskId: string,
    updates: Partial<Task>,
  ) => Promise<void> | void;
  onTaskToggle: (taskId: string) => void;
  onTaskEdit: (task: Task) => void;
  onTaskDelete: (taskId: string) => void;
  onTaskSelect?: (taskId: string, event?: React.MouseEvent) => void;
}

// Default priority colors - shades of red (brighter = higher priority)
const getDefaultPriorityColors = () => ({
  1: "#ef4444", // red-500 - brightest (highest priority)
  2: "#f87171", // red-400
  3: "#fca5a5", // red-300
  4: "#fecaca", // red-200 - lightest (lowest priority)
});

// Standard priority colors for flag icons (distinct colors per level)
const STANDARD_PRIORITY_FLAG_COLORS: Record<number, string> = {
  1: "#ef4444", // red - urgent
  2: "#f97316", // orange - high
  3: "#3b82f6", // blue - medium
  4: "#6b7280", // gray - low
};

// Generate priority colors based on a base hue
const generatePriorityColors = (baseColor: string) => {
  // If it's a hex color, use it to generate shades
  if (baseColor.startsWith("#")) {
    // Convert hex to HSL to generate shades
    const hex = baseColor.replace("#", "");
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0,
      s = 0,
      l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
          break;
        case g:
          h = ((b - r) / d + 2) / 6;
          break;
        case b:
          h = ((r - g) / d + 4) / 6;
          break;
      }
    }

    // Generate 4 shades with same hue, varying saturation and lightness
    const hslToHex = (h: number, s: number, l: number) => {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
      const g = Math.round(hue2rgb(p, q, h) * 255);
      const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
      return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    };

    return {
      1: hslToHex(h, Math.min(s * 1.2, 1), 0.45), // brightest (highest priority)
      2: hslToHex(h, s, 0.55),
      3: hslToHex(h, s * 0.8, 0.65),
      4: hslToHex(h, s * 0.6, 0.75), // lightest (lowest priority)
    };
  }
  return getDefaultPriorityColors();
};

// Overdue colors - graduated shades of red (darker = more overdue)
const getOverdueColor = (dueDate: string) => {
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysOverdue = Math.floor(
    (today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (daysOverdue <= 0) return null; // Not overdue
  if (daysOverdue === 1) return "#fca5a5"; // red-300 - lightest
  if (daysOverdue === 2) return "#f87171"; // red-400
  if (daysOverdue === 3) return "#ef4444"; // red-500
  if (daysOverdue <= 7) return "#dc2626"; // red-600
  if (daysOverdue <= 14) return "#b91c1c"; // red-700
  if (daysOverdue <= 21) return "#991b1b"; // red-800
  return "#7f1d1d"; // red-900 - darkest (4+ weeks)
};

export function TaskList({
  tasks,
  allTasks,
  projects,
  tags,
  currentUserId,
  priorityColor,
  showCompleted = false,
  completedAccordionKey,
  revealActionsOnHover = false,
  uniformDueBadgeWidth = false,
  dueDateLayout = "inline",
  bulkSelectMode = false,
  selectedTaskIds,
  loadingTaskIds,
  animatingOutTaskIds,
  optimisticCompletedIds,
  deletingTaskIds,
  savingTaskIds,
  recentlySavedTaskIds,
  freshlyUpdatedTaskIds,
  emailThreadIdByTaskId,
  onOpenEmailThread,
  onAddDependency,
  showDescriptions = true,
  enableDueDateQuickEdit,
  onTaskFocus,
  onTaskUpdate,
  onTaskToggle,
  onTaskEdit,
  onTaskDelete,
  onTaskSelect,
}: TaskListProps) {
  // Generate priority colors based on user preference or default to green
  const priorityColors = useMemo(
    () =>
      priorityColor
        ? generatePriorityColors(priorityColor)
        : getDefaultPriorityColors(),
    [priorityColor],
  );
  const tagsById = useMemo(
    () => new Map((tags || []).map((tag) => [tag.id, tag] as const)),
    [tags],
  );
  const taskById = useMemo(
    () => new Map(tasks.map((task) => [task.id, task] as const)),
    [tasks],
  );
  const taskChildrenByParent = useMemo(() => {
    const childrenByParent = new Map<string, Task[]>();
    tasks.forEach((task) => {
      if (!task.parentId) return;
      const children = childrenByParent.get(task.parentId) || [];
      children.push(task);
      childrenByParent.set(task.parentId, children);
    });
    return childrenByParent;
  }, [tasks]);
  const blockedTaskIds = useMemo(
    () => (allTasks ? getBlockedTaskIds(allTasks) : new Set<string>()),
    [allTasks],
  );
  const [showCompletedTasks, setShowCompletedTasks] = useState(showCompleted);
  // Initialize with all parent task IDs so accordions start collapsed
  const [collapsedTasks, setCollapsedTasks] = useState<Set<string>>(() => {
    const parentIds = new Set<string>();
    tasks.forEach((task) => {
      if (task.parentId) {
        parentIds.add(task.parentId);
      }
    });
    return parentIds;
  });
  const [copiedTaskId, setCopiedTaskId] = useState<string | null>(null);
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(
    new Set(),
  );
  const [hasLoadedCompletedState, setHasLoadedCompletedState] = useState(false);
  const [quickEditTaskId, setQuickEditTaskId] = useState<string | null>(null);
  const [quickDueDate, setQuickDueDate] = useState("");
  const [quickDueTime, setQuickDueTime] = useState("");
  const [quickSaving, setQuickSaving] = useState(false);

  // Load completed accordion state from localStorage
  useEffect(() => {
    if (completedAccordionKey && !hasLoadedCompletedState) {
      const saved = localStorage.getItem(
        `completedAccordion_${completedAccordionKey}`,
      );
      if (saved !== null) {
        setShowCompletedTasks(saved === "true");
      }
      setHasLoadedCompletedState(true);
    }
  }, [completedAccordionKey, hasLoadedCompletedState]);

  // Save completed accordion state to localStorage
  useEffect(() => {
    if (completedAccordionKey && hasLoadedCompletedState) {
      localStorage.setItem(
        `completedAccordion_${completedAccordionKey}`,
        showCompletedTasks.toString(),
      );
    }
  }, [showCompletedTasks, completedAccordionKey, hasLoadedCompletedState]);

  // Helper to get project acronym
  const getProjectAcronym = (name: string) => {
    const words = name.split(/\s+/);
    if (words.length === 1) {
      return name.substring(0, 2).toUpperCase();
    }
    return words
      .map((word) => word.charAt(0))
      .join("")
      .toUpperCase()
      .substring(0, 3);
  };

  const copyTaskId = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(taskId);
      setCopiedTaskId(taskId);
      setTimeout(() => setCopiedTaskId(null), 1500);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const getRecurringTooltip = (pattern: string) => {
    return formatRecurringLabel(pattern);
  };

  const activeTasks = useMemo(
    () => tasks.filter((task) => !task.completed),
    [tasks],
  );
  const completedTasks = useMemo(
    () => tasks.filter((task) => task.completed),
    [tasks],
  );

  const sortTasks = useCallback((tasksToSort: Task[]) => {
    return [...tasksToSort].sort((a, b) => {
      // By priority (1 is highest)
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      // Then by due date
      const aDueDate = (a as any).due_date ?? a.dueDate;
      const bDueDate = (b as any).due_date ?? b.dueDate;
      if (aDueDate && bDueDate) {
        return new Date(aDueDate).getTime() - new Date(bDueDate).getTime();
      }
      return 0;
    });
  }, []);

  // Organize tasks hierarchically
  const organizeTasksHierarchically = useCallback((tasksToOrganize: Task[]): Task[] => {
    const taskIds = new Set(tasksToOrganize.map((task) => task.id));
    const rootTasks: Task[] = [];
    const sortedTasks: Task[] = [];

    // First, identify root tasks (no parent)
    tasksToOrganize.forEach((task) => {
      if (!task.parentId || !taskIds.has(task.parentId)) {
        rootTasks.push(task);
      }
    });

    // Sort root tasks
    const sortedRoots = sortTasks(rootTasks);

    // Build hierarchical structure
    const addTaskWithChildren = (task: Task) => {
      sortedTasks.push(task);

      // Skip children if task is collapsed
      if (!collapsedTasks.has(task.id)) {
        const children = (taskChildrenByParent.get(task.id) || []).filter(
          (child) => taskIds.has(child.id),
        );
        sortTasks(children).forEach((child) => {
          addTaskWithChildren(child);
        });
      }
    };

    sortedRoots.forEach((task) => {
      addTaskWithChildren(task);
    });

    return sortedTasks;
  }, [collapsedTasks, sortTasks, taskChildrenByParent]);

  const sortedActiveTasks = useMemo(
    () => organizeTasksHierarchically(activeTasks),
    [activeTasks, organizeTasksHierarchically],
  );
  const sortedCompletedTasks = useMemo(
    () => organizeTasksHierarchically(completedTasks),
    [completedTasks, organizeTasksHierarchically],
  );

  const formatFullDueDate = (
    date: string,
    time?: string,
    forceTime = false,
  ) => {
    const hasTimeInDate = date.includes("T");
    const dateOnly = hasTimeInDate ? date.split("T")[0] : date;
    const normalizedTime = time
      ? time.length === 5
        ? `${time}:00`
        : time
      : null;
    const hasTime = forceTime || !!normalizedTime || hasTimeInDate;
    const dateTime = normalizedTime
      ? `${dateOnly}T${normalizedTime}`
      : hasTimeInDate
        ? date
        : `${dateOnly}T00:00:00`;

    const parsed = new Date(dateTime);
    if (Number.isNaN(parsed.getTime())) {
      const fallback = getStartOfDay(dateOnly);
      const month = `${format(fallback, "MMM")}.`;
      const day = format(fallback, "do");
      const year = `'${format(fallback, "yy")}`;
      // Midnight is treated as "no time set" — suppress the time part.
      return `${month} ${day} ${year}`;
    }

    const month = `${format(parsed, "MMM")}.`;
    const day = format(parsed, "do");
    const year = `'${format(parsed, "yy")}`;
    // Suppress time display when it's exactly midnight (00:00) — our convention
    // for "no time set" — even if forceTime was requested.
    const isMidnight = parsed.getHours() === 0 && parsed.getMinutes() === 0;
    const timePart = hasTime && !isMidnight ? ` ${format(parsed, "h:mm a")}` : "";
    return `${month} ${day} ${year}${timePart}`;
  };

  const hasChildren = useCallback(
    (taskId: string) => (taskChildrenByParent.get(taskId)?.length || 0) > 0,
    [taskChildrenByParent],
  );

  const quickDateOptions = [
    { label: "Today", date: format(new Date(), "yyyy-MM-dd") },
    { label: "Tomorrow", date: format(addDays(new Date(), 1), "yyyy-MM-dd") },
    { label: "Next Week", date: format(addDays(new Date(), 7), "yyyy-MM-dd") },
  ];

  const openQuickEditor = (task: Task) => {
    const dueDate = (task as any).due_date || task.dueDate || "";
    const dueTime = (task as any).due_time || task.dueTime || "";
    setQuickDueDate(dueDate || "");
    setQuickDueTime(dueTime || "");
    setQuickEditTaskId(task.id);
  };

  const applyQuickDueDate = async (task: Task) => {
    if (!onTaskUpdate) return;
    setQuickSaving(true);
    try {
      const nextDueDate = quickDueDate || null;
      const nextDueTime = quickDueDate ? quickDueTime || null : null;
      const updates: Record<string, any> = {
        due_date: nextDueDate,
        due_time: nextDueTime,
      };
      await onTaskUpdate(task.id, updates as any);
      setQuickEditTaskId(null);
    } catch (error) {
      console.error("Error updating due date:", error);
    } finally {
      setQuickSaving(false);
    }
  };

  const getIndentLevel = (task: Task): number => {
    let level = 0;
    let currentTask = task;
    while (currentTask.parentId) {
      level++;
      currentTask = taskById.get(currentTask.parentId) || currentTask;
      if (currentTask.id === task.id) break; // Prevent infinite loop
    }
    return level;
  };

  const renderRichDescription = (text: string) => {
    // If the description contains HTML, render it directly.
    if (/<[a-z][\s\S]*>/i.test(text)) {
      return (
        <div
          className="prose prose-invert prose-sm max-w-none [&_img]:max-w-full [&_img]:rounded [&_a]:text-sky-400 [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: text }}
        />
      );
    }
    // Plain text: linkify URLs, embed image URLs, show link preview cards.
    const parts = text.split(/(https?:\/\/[^\s]+)/g);
    return (
      <div className="space-y-2 whitespace-pre-wrap break-words">
        {parts.map((part, idx) => {
          if (!/^https?:\/\//.test(part)) {
            return <span key={idx}>{part}</span>;
          }
          const isImage = /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(part);
          if (isImage) {
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={idx}
                src={part}
                alt=""
                className="my-1 max-h-48 max-w-full rounded border border-zinc-700"
              />
            );
          }
          let host = part;
          try {
            host = new URL(part).hostname;
          } catch {}
          return (
            <a
              key={idx}
              href={part}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="my-1 flex items-center gap-2 rounded border border-zinc-700 bg-zinc-800/80 px-2 py-1.5 text-sky-400 hover:bg-zinc-700/80"
            >
              <img
                src={`https://www.google.com/s2/favicons?domain=${host}&sz=32`}
                alt=""
                className="h-4 w-4 rounded-sm"
              />
              <span className="truncate text-xs">{part}</span>
            </a>
          );
        })}
      </div>
    );
  };

  const renderTask = (task: Task) => {
    const indentLevel = getIndentLevel(task);
    const hasSubtasks = hasChildren(task.id);
    const isCollapsed = collapsedTasks.has(task.id);
    const isLoading = loadingTaskIds?.has(task.id);
    const isAnimatingOut = animatingOutTaskIds?.has(task.id);
    const isOptimisticCompleted = optimisticCompletedIds?.has(task.id);
    const isDeleting = deletingTaskIds?.has(task.id);
    const isSaving = savingTaskIds?.has(task.id);
    const isRecentlySaved = recentlySavedTaskIds?.has(task.id);
    // Highlight rows that arrived/changed via a background refetch — but not
    // ones the user just saved themselves (those already get the green check).
    const isFreshlyUpdated =
      freshlyUpdatedTaskIds?.has(task.id) && !isRecentlySaved && !isSaving;
    const taskTagBadges = task.tagBadges?.length
      ? task.tagBadges
      : (task.tags || []).reduce<NonNullable<Task["tagBadges"]>>(
          (acc, tagId) => {
            const tag = tagsById.get(tagId);
            if (tag) {
              acc.push(tag);
            }
            return acc;
          },
          [],
        );
    const isCompleted = task.completed || isOptimisticCompleted;
    const dueDate = (task as any).due_date || task.dueDate;
    const dueDateOnly = dueDate
      ? dueDate.includes("T")
        ? dueDate.split("T")[0]
        : dueDate
      : null;
    const isDueToday = !!(dueDateOnly && isToday(dueDateOnly));
    const isBlocked = blockedTaskIds.has(task.id);
    const actionVisibilityClass = revealActionsOnHover
      ? "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"
      : "opacity-100 pointer-events-auto";

    // Pre-compute due date badge for flexible layout positioning
    const dueDateBadge = (() => {
      const dd = (task as any).due_date || task.dueDate;
      const dt = (task as any).due_time || task.dueTime;
      if (!dd) return null;
      const formatted = formatFullDueDate(dd, dt || undefined, true);
      // Overdue urgency stays visible via a red icon even when the date text
      // is hidden behind hover.
      const ddOnly = dd.includes("T") ? dd.split("T")[0] : dd;
      const isOverdueDate = !!getOverdueColor(ddOnly);
      const iconColorClass = isOverdueDate
        ? "text-red-400"
        : isToday(ddOnly)
          ? "text-orange-300"
          : "text-zinc-400";
      // Date text is collapsed by default and revealed on row/badge hover via a
      // max-width transition (no layout shift for surrounding content).
      const revealText = (
        <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-200 group-hover:max-w-[200px] group-hover:opacity-100 group-hover/datebadge:max-w-[200px] group-hover/datebadge:opacity-100">
          {formatted}
        </span>
      );
      if (!enableDueDateQuickEdit || !onTaskUpdate) {
        return (
          <span
            className="group/datebadge flex items-center gap-1 text-[11px] flex-shrink-0"
            title={formatted}
          >
            <Calendar className={`w-3.5 h-3.5 ${iconColorClass}`} />
            {revealText}
          </span>
        );
      }
      const isOpen = quickEditTaskId === task.id;
      return (
        <Popover.Root
          open={isOpen}
          onOpenChange={(open) => {
            if (open) {
              openQuickEditor(task);
            } else if (quickEditTaskId === task.id) {
              setQuickEditTaskId(null);
            }
          }}
        >
          <Popover.Trigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className="group/datebadge flex items-center gap-1 text-[11px] flex-shrink-0"
              aria-label="Edit due date"
              title={formatted}
            >
              <Calendar className={`w-3.5 h-3.5 ${iconColorClass}`} />
              {revealText}
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              side="bottom"
              align="start"
              sideOffset={8}
              className="z-50 w-64 rounded-lg bg-zinc-900 border border-zinc-800 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-300">
                    Due date
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setQuickDueDate("");
                      setQuickDueTime("");
                    }}
                    className="text-xs text-zinc-500 hover:text-zinc-300"
                  >
                    Clear
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {quickDateOptions.map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => setQuickDueDate(option.date)}
                      className={`px-2 py-1 rounded text-xs border transition-colors ${
                        quickDueDate === option.date
                          ? "bg-[rgb(var(--theme-primary-rgb))]/20 text-[rgb(var(--theme-primary-rgb))] border-[rgb(var(--theme-primary-rgb))]/40"
                          : "bg-zinc-800 text-zinc-300 border-zinc-700 hover:border-zinc-500"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[11px] text-zinc-500">
                    Date
                    <input
                      type="date"
                      value={quickDueDate}
                      onChange={(e) => setQuickDueDate(e.target.value)}
                      className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white themed-date-input"
                    />
                  </label>
                  <label className="text-[11px] text-zinc-500">
                    Time
                    <input
                      type="time"
                      value={quickDueTime}
                      onChange={(e) => setQuickDueTime(e.target.value)}
                      className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-white themed-date-input"
                    />
                  </label>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setQuickEditTaskId(null)}
                    className="text-xs text-zinc-500 hover:text-zinc-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => applyQuickDueDate(task)}
                    disabled={quickSaving}
                    className="px-2 py-1 text-xs rounded bg-[rgb(var(--theme-primary-rgb))] text-white hover:bg-[rgb(var(--theme-primary-rgb))]/80 disabled:opacity-60"
                  >
                    {quickSaving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
              <Popover.Arrow
                className="fill-zinc-900 stroke-zinc-800"
                width={10}
                height={6}
              />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      );
    })();

    return (
      <div
        key={task.id}
        data-task-row="true"
        data-task-id={task.id}
        draggable={!isLoading && !isAnimatingOut}
        onMouseDown={() => onTaskFocus?.(task.id)}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("taskId", task.id);
        }}
        className={`task-list-row group relative z-0 hover:z-40 flex items-center gap-3 px-4 py-1 rounded-lg hover:bg-zinc-800/50 cursor-move ${
          isFreshlyUpdated ? "fresh-data-highlight" : ""
        } ${isCompleted ? "opacity-50" : ""
        } ${isAnimatingOut ? "animate-slide-fade-out" : ""} ${isOptimisticCompleted && !isAnimatingOut ? "gradient-strikethrough gradient-strikethrough-complete" : ""} ${isLoading ? "opacity-70" : ""} ${
          isDeleting
            ? "gradient-strikethrough gradient-strikethrough-delete animate-breathe pointer-events-none"
            : ""
        } ${
          hasSubtasks && !isCollapsed
            ? "bg-violet-950/40 hover:bg-violet-950/50"
            : indentLevel > 0
              ? "bg-violet-900/10 hover:bg-violet-900/20"
              : ""
        }`}
        style={{ paddingLeft: `${16 + indentLevel * 24}px` }}
      >
        {/* Fixed-width expander slot (far left) — always reserved so parent and
            non-parent rows align identically with zero layout shift. */}
        <div className="flex w-4 flex-shrink-0 items-center justify-center">
          {hasSubtasks ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCollapsedTasks((prev) => {
                  const next = new Set(prev);
                  if (next.has(task.id)) {
                    next.delete(task.id);
                  } else {
                    next.add(task.id);
                  }
                  return next;
                });
              }}
              className="relative group/expand text-zinc-400 hover:text-zinc-300 transition-colors"
              aria-label={isCollapsed ? "Show subtasks" : "Hide subtasks"}
            >
              {isCollapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
              <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-white bg-black rounded shadow-lg whitespace-nowrap opacity-0 group-hover/expand:opacity-100 transition-opacity pointer-events-none z-50">
                {isCollapsed ? "Show subtasks" : "Hide subtasks"}
              </span>
            </button>
          ) : null}
        </div>

        <div className="relative flex flex-shrink-0 items-center justify-center">
          <span className="relative group/copyid flex items-center justify-center">
            <button
              onClick={(e) => copyTaskId(task.id, e)}
              className="text-zinc-600 hover:text-[rgb(var(--theme-primary-rgb))] transition-colors"
              aria-label="Copy task ID"
            >
              <Hash className="w-4 h-4" />
            </button>
            <span className="absolute left-full ml-2 px-2 py-1 text-xs text-white bg-black rounded shadow-lg whitespace-nowrap opacity-0 group-hover/copyid:opacity-100 transition-opacity pointer-events-none z-50">
              Copy task ID
            </span>
          </span>
          {copiedTaskId === task.id && (
            <span className="absolute left-0 top-full mt-1 z-50 whitespace-nowrap text-[10px] font-medium text-green-400 animate-fade-in-up">
              Copied!
            </span>
          )}
        </div>

        {bulkSelectMode &&
          onTaskSelect &&
          (isLoading ? (
            <Loader2 className="w-4 h-4 text-[rgb(var(--theme-primary-rgb))] animate-spin mr-1" />
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTaskSelect(task.id, e);
              }}
              className="text-zinc-400 hover:text-[rgb(var(--theme-primary-rgb))] transition-colors mr-1"
              disabled={isAnimatingOut}
            >
              {selectedTaskIds?.has(task.id) ? (
                <CheckSquare className="w-4 h-4 text-[rgb(var(--theme-primary-rgb))]" />
              ) : (
                <Square className="w-4 h-4" />
              )}
            </button>
          ))}

        <button
          onClick={() => {
            if (!isBlocked) {
              onTaskToggle(task.id);
            }
          }}
          className={`transition-colors flex-shrink-0 ${
            isDeleting
              ? "text-red-400"
              : isCompleted
                ? "text-green-500"
                : isBlocked
                  ? "text-zinc-500 cursor-not-allowed"
                  : isDueToday
                    ? "text-zinc-400"
                    : ""
          }`}
          style={
            !isCompleted && !isBlocked && !isDueToday
              ? { color: priorityColors[task.priority] }
              : undefined
          }
          disabled={isBlocked || isOptimisticCompleted}
          aria-label={isBlocked ? "Blocked — complete dependencies first" : "Complete task"}
          title={
            isBlocked
              ? "Complete dependencies first"
              : isCompleted
                ? "Reopen task"
                : "Complete task"
          }
        >
          {isCompleted ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : isBlocked ? (
            <AlertCircle className="w-5 h-5" />
          ) : (
            <Circle className="w-5 h-5" />
          )}
        </button>

        {projects &&
          (() => {
            const projectId = (task as any).project_id || task.projectId;
            if (!projectId) return null;
            const project = projects.find((p) => p.id === projectId);
            return project ? (
              <span className="relative group/projectleft flex flex-shrink-0 items-center justify-center w-4">
                <span
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[6px] font-bold text-white"
                  style={{ backgroundColor: project.color }}
                >
                  {getProjectAcronym(project.name)}
                </span>
                <span className="absolute left-full ml-2 px-2 py-1 text-xs text-white bg-black rounded shadow-lg whitespace-nowrap opacity-0 group-hover/projectleft:opacity-100 transition-opacity pointer-events-none z-50">
                  {project.name}
                </span>
              </span>
            ) : null;
          })()}

        <div
          className="flex-1 min-w-0 cursor-pointer"
          onClick={() => onTaskEdit(task)}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2 min-w-0">
                {dueDateLayout === "inline" && dueDateBadge}
                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  <div
                    className={`flex items-start gap-1.5 text-left text-sm leading-5 ${
                      isDeleting
                        ? "line-through text-red-400"
                        : isCompleted
                          ? "line-through text-green-500"
                          : isBlocked
                            ? "text-zinc-400"
                            : "text-white"
                    }`}
                  >
                    {(isLoading || isDeleting) && (
                      <Loader2
                        className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 animate-spin ${
                          isDeleting ? "text-red-400" : "text-zinc-400"
                        }`}
                      />
                    )}
                    {isSaving && (
                      <Loader2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 animate-spin text-[rgb(var(--theme-primary-rgb))]" />
                    )}
                    {!isSaving && isRecentlySaved && (
                      <CheckCircle2
                        className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-green-500 transition-opacity duration-1000 ease-out opacity-0"
                        style={{ animation: "task-save-check-fade 3s ease-out forwards" }}
                      />
                    )}
                    <span className="min-w-0 flex-1 whitespace-normal break-words">
                      {task.name}
                    </span>
                  </div>
                  {task.description &&
                    (() => {
                      const isDescOpen =
                        showDescriptions ||
                        expandedDescriptions.has(task.id);
                      return (
                        <div className="flex flex-col">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedDescriptions((prev) => {
                                const next = new Set(prev);
                                if (next.has(task.id)) {
                                  next.delete(task.id);
                                } else {
                                  next.add(task.id);
                                }
                                return next;
                              });
                            }}
                            className="flex w-fit items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                            aria-label={
                              isDescOpen ? "Hide description" : "Show description"
                            }
                            aria-expanded={isDescOpen}
                          >
                            <AlignLeft className="h-3 w-3" />
                            <ChevronDown
                              className={`h-3 w-3 transition-transform duration-200 ${
                                isDescOpen ? "rotate-180" : ""
                              }`}
                            />
                          </button>
                          {/* Animated slide-down reveal via grid-rows transition */}
                          <div
                            className={`grid transition-all duration-200 ease-out ${
                              isDescOpen
                                ? "grid-rows-[1fr] opacity-100 mt-1"
                                : "grid-rows-[0fr] opacity-0"
                            }`}
                          >
                            <div className="overflow-hidden">
                              <div className="text-xs text-zinc-400 text-left">
                                {renderRichDescription(task.description)}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  {dueDateLayout === "below" && dueDateBadge && (
                    <div className="mt-1">{dueDateBadge}</div>
                  )}
                </div>
                {isBlocked && !isCompleted && (
                  <div className="relative group/blocked flex items-center gap-1 text-[rgb(var(--theme-primary-rgb))] flex-shrink-0 cursor-help">
                    <Link2 className="w-3 h-3" />
                    <span className="text-xs">Blocked</span>
                    <span className="absolute right-0 bottom-full mb-1 px-2 py-1.5 text-xs text-white bg-black rounded shadow-lg whitespace-nowrap opacity-0 group-hover/blocked:opacity-100 transition-opacity pointer-events-none z-50">
                      <span className="block font-semibold text-zinc-300">
                        Blocked by:
                      </span>
                      {(allTasks
                        ? getBlockingTasks(task, allTasks)
                        : []
                      ).map((blocker) => (
                        <span key={blocker.id} className="block">
                          • {blocker.name}
                        </span>
                      ))}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center text-xs flex-shrink-0">
              <div
                className={`mr-2 flex translate-x-3 items-center gap-3 rounded-md bg-zinc-800/95 px-2 py-1 transition-all duration-200 group-hover:translate-x-0 ${actionVisibilityClass}`}
              >
                {((task as any).due_date || task.dueDate) && onTaskUpdate ? (
                  <span className="relative group/removedate flex items-center justify-center w-4">
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        await onTaskUpdate(task.id, {
                          due_date: null,
                          due_time: null,
                        } as any);
                      }}
                      className="text-zinc-600 hover:text-orange-400 transition-colors"
                      aria-label="Remove due date"
                    >
                      <CalendarX2 className="w-4 h-4" />
                    </button>
                    <span className="absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 px-2 py-1 text-xs text-white bg-black rounded shadow-lg whitespace-nowrap opacity-0 group-hover/removedate:opacity-100 transition-opacity pointer-events-none z-50">
                      Remove due date
                    </span>
                  </span>
                ) : null}

                {onAddDependency ? (
                  <span className="relative group/adddep flex items-center justify-center w-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddDependency(task);
                      }}
                      className="text-zinc-600 hover:text-[rgb(var(--theme-primary-rgb))] transition-colors"
                      aria-label="Add dependency"
                    >
                      <Link2 className="w-4 h-4" />
                    </button>
                    <span className="absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 px-2 py-1 text-xs text-white bg-black rounded shadow-lg whitespace-nowrap opacity-0 group-hover/adddep:opacity-100 transition-opacity pointer-events-none z-50">
                      Add dependency
                    </span>
                  </span>
                ) : null}

                <span className="relative group/editbtn flex items-center justify-center w-4">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onTaskEdit(task);
                    }}
                    className="text-zinc-600 hover:text-zinc-400 transition-colors"
                    aria-label="Edit task"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <span className="absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 px-2 py-1 text-xs text-white bg-black rounded shadow-lg whitespace-nowrap opacity-0 group-hover/editbtn:opacity-100 transition-opacity pointer-events-none z-50">
                    Edit task
                  </span>
                </span>

                <span className="relative group/deletebtn flex items-center justify-center w-4">
                  {isDeleting ? (
                    <Loader2 className="w-4 h-4 animate-spin text-red-400" />
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onTaskDelete(task.id);
                      }}
                      className="text-zinc-600 hover:text-red-400 transition-colors"
                      aria-label="Delete task"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <span className="absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 px-2 py-1 text-xs text-white bg-black rounded shadow-lg whitespace-nowrap opacity-0 group-hover/deletebtn:opacity-100 transition-opacity pointer-events-none z-50">
                    Delete task (moves to Trash)
                  </span>
                </span>
              </div>

              <div className="flex items-center gap-2">
                {(task as any).devnotesMeta || (task as any).devnotes_meta ? (
                  <span className="relative group/devnotes flex items-center justify-center w-4">
                    <StickyNote className="w-4 h-4 text-amber-400" />
                    <span className="absolute right-full mr-2 px-2 py-1 text-xs text-white bg-black rounded shadow-lg whitespace-nowrap opacity-0 group-hover/devnotes:opacity-100 transition-opacity pointer-events-none z-50">
                      Has DevNotes
                    </span>
                  </span>
                ) : null}

                {emailThreadIdByTaskId?.[task.id] && onOpenEmailThread ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenEmailThread(emailThreadIdByTaskId[task.id]);
                    }}
                    className="relative group/emaillink flex items-center justify-center w-4"
                  >
                    <Mail className="w-4 h-4 text-sky-400" />
                    <span className="absolute right-full mr-2 px-2 py-1 text-xs text-white bg-black rounded shadow-lg whitespace-nowrap opacity-0 group-hover/emaillink:opacity-100 transition-opacity pointer-events-none z-50">
                      View linked email
                    </span>
                  </button>
                ) : null}
                {task.todoistId ? (
                  <span
                    className={`relative group/todoist flex items-center justify-center w-4 transition-opacity ${actionVisibilityClass}`}
                  >
                    <span className="text-[10px] text-zinc-500 font-bold">
                      T
                    </span>
                    <span className="absolute left-full ml-2 px-2 py-1 text-xs text-white bg-black rounded shadow-lg whitespace-nowrap opacity-0 group-hover/todoist:opacity-100 transition-opacity pointer-events-none z-50">
                      Synced from Todoist
                    </span>
                  </span>
                ) : null}

                {/* Recurring - first position */}
                {task.recurringPattern ? (
                  <span className="relative group/recurring flex items-center justify-center w-4">
                    <Repeat2 className="w-4 h-4 text-purple-400" />
                    <span className="absolute left-full ml-2 px-2 py-1 text-xs text-white bg-black rounded shadow-lg whitespace-nowrap opacity-0 group-hover/recurring:opacity-100 transition-opacity pointer-events-none z-50">
                      {getRecurringTooltip(task.recurringPattern)}
                    </span>
                  </span>
                ) : null}

                {task.assignedToName ? (
                  <span className="relative group/assignee flex items-center justify-center w-4">
                    <UserAvatar
                      name={(task as any).assignedToName}
                      profileColor={(task as any).assignedToColor}
                      memoji={(task as any).assignedToMemoji}
                      size={16}
                      className="text-[9px] font-medium"
                    />
                    <span className="absolute left-full ml-2 px-2 py-1 text-xs text-white bg-black rounded shadow-lg whitespace-nowrap opacity-0 group-hover/assignee:opacity-100 transition-opacity pointer-events-none z-50">
                      {task.assignedToName}
                    </span>
                  </span>
                ) : null}

                {task.deadline ? (
                  <span className="relative group/deadline flex items-center justify-center w-4 text-red-400">
                    <Flag className="w-4 h-4" />
                    <span className="absolute left-full ml-2 px-2 py-1 text-xs text-white bg-black rounded shadow-lg whitespace-nowrap opacity-0 group-hover/deadline:opacity-100 transition-opacity pointer-events-none z-50">
                      Deadline: {formatFullDueDate(task.deadline)}
                    </span>
                  </span>
                ) : null}

                {/* Time Estimate */}
                {(() => {
                  const te =
                    (task as any).time_estimate ?? (task as any).timeEstimate;
                  if (!te) return null;
                  const mins = Number(te);
                  const h = Math.floor(mins / 60);
                  const m = mins % 60;
                  const label =
                    h > 0 && m > 0 ? `${h}h ${m}m` : h > 0 ? `${h}h` : `${m}m`;
                  return (
                    <span
                      className="relative group/estimate flex items-center justify-center gap-0.5"
                      title={`Estimated: ${label}`}
                    >
                      <Clock className="w-3.5 h-3.5 text-teal-400" />
                      <span className="text-[10px] text-teal-400 font-medium">
                        {label}
                      </span>
                      <span className="absolute left-full ml-2 px-2 py-1 text-xs text-white bg-black rounded shadow-lg whitespace-nowrap opacity-0 group-hover/estimate:opacity-100 transition-opacity pointer-events-none z-50">
                        Estimated: {label}
                      </span>
                    </span>
                  );
                })()}

                {/* Comments indicator */}
                {(task as any).todoistCommentCount > 0 ||
                (task as any).commentCount > 0 ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onTaskEdit(task);
                    }}
                    className="relative group/comments flex items-center justify-center w-4"
                  >
                    <MessageCircle className="w-4 h-4 text-blue-400" />
                    <span className="absolute -top-1 -right-1 min-w-[12px] h-3 bg-blue-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5">
                      {(task as any).todoistCommentCount ||
                        (task as any).commentCount}
                    </span>
                    <span className="absolute left-full ml-2 px-2 py-1 text-xs text-white bg-black rounded shadow-lg whitespace-nowrap opacity-0 group-hover/comments:opacity-100 transition-opacity pointer-events-none z-50">
                      {(task as any).todoistCommentCount ||
                        (task as any).commentCount}{" "}
                      comment
                      {((task as any).todoistCommentCount ||
                        (task as any).commentCount) !== 1
                        ? "s"
                        : ""}
                    </span>
                  </button>
                ) : null}

                {!isCompleted ? (
                  <span className="relative group/priority flex items-center justify-center w-4">
                    <Flag
                      className="w-4 h-4"
                      style={{
                        color: STANDARD_PRIORITY_FLAG_COLORS[task.priority],
                      }}
                    />
                    <span className="absolute left-full ml-2 px-2 py-1 text-xs text-white bg-black rounded shadow-lg whitespace-nowrap opacity-0 group-hover/priority:opacity-100 transition-opacity pointer-events-none z-50">
                      Priority {task.priority}
                    </span>
                  </span>
                ) : null}

                {taskTagBadges.length > 0 ? (
                  <div className="flex items-center gap-1.5 max-w-[220px] overflow-hidden">
                    {taskTagBadges.slice(0, 3).map((tag) => (
                      <span
                        key={tag.id}
                        className="inline-flex max-w-[88px] items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] truncate"
                        style={{
                          color: tag.color,
                          borderColor: `${tag.color}66`,
                          backgroundColor: `${tag.color}1a`,
                        }}
                        title={tag.name}
                      >
                        {tag.name}
                      </span>
                    ))}
                    {taskTagBadges.length > 3 ? (
                      <span
                        className="text-[10px] text-zinc-500"
                        title={taskTagBadges
                          .slice(3)
                          .map((tag) => tag.name)
                          .join(", ")}
                      >
                        +{taskTagBadges.length - 3}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {dueDateLayout === "right" && dueDateBadge}
              </div>


            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="py-4">
      {sortedActiveTasks.map(renderTask)}

      {sortedActiveTasks.length === 0 && completedTasks.length === 0 && (
        <div className="text-center py-12 text-zinc-500">
          <p>No tasks to display</p>
        </div>
      )}

      {completedTasks.length > 0 && (
        <div className="mt-8 border-t border-zinc-800 pt-4">
          <button
            onClick={() => setShowCompletedTasks(!showCompletedTasks)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-300 transition-colors"
          >
            {showCompletedTasks ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            Completed ({completedTasks.length})
          </button>

          {showCompletedTasks && (
            <div className="mt-2">{sortedCompletedTasks.map(renderTask)}</div>
          )}
        </div>
      )}
    </div>
  );
}
