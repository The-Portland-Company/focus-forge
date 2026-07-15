"use client";

import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addDays, format } from "date-fns";
import {
  Check,
  Circle,
  CheckCircle2,
  Edit,
  UserPlus,
  UserX,
  FolderOpen,
  Flag,
  Calendar,
  CalendarX2,
  Link2,
  Copy,
  Trash2,
  Search,
  ChevronRight,
} from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { filterAvailableMembers } from "@/components/existing-member-picker";
import type { Task, Project, User } from "@/lib/types";

const BARTOK_USER_ID =
  process.env.NEXT_PUBLIC_BARTOK_USER_ID ||
  "ef411928-38bb-47a7-8ee1-44d4be5d3a5a";

const PRIORITY_FLAG_COLORS: Record<number, string> = {
  1: "#ef4444",
  2: "#f97316",
  3: "#3b82f6",
  4: "#6b7280",
};

function displayName(user: User) {
  return (
    user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
    user.email
  );
}

type Section = "root" | "assign" | "project" | "priority" | "due";

export interface TaskContextMenuProps {
  task: Task;
  x: number;
  y: number;
  projects?: Project[];
  members?: User[];
  currentUserId?: string;
  onClose: () => void;
  onToggle: (taskId: string) => void;
  onEdit: (task: Task) => void;
  onUpdate?: (taskId: string, updates: Partial<Task>) => Promise<void> | void;
  onAddDependency?: (task: Task) => void;
  onDelete: (taskId: string) => void;
}

/**
 * Cursor-anchored right-click menu for a task row. Mirrors the portal-popover
 * pattern of ProjectQuickPicker (fixed-position, outside-click + Escape close)
 * and drives all mutations through the callbacks already threaded into the row
 * — no new endpoints. Reassignment sends { assignedTo } through onUpdate.
 */
export function TaskContextMenu({
  task,
  x,
  y,
  projects,
  members,
  currentUserId,
  onClose,
  onToggle,
  onEdit,
  onUpdate,
  onAddDependency,
  onDelete,
}: TaskContextMenuProps) {
  const [section, setSection] = useState<Section>("root");
  const [query, setQuery] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const isCompleted = !!task.completed;
  const currentAssignee = (task as any).assigned_to ?? task.assignedTo ?? null;
  const currentProjectId = (task as any).project_id ?? task.projectId ?? null;
  const hasDueDate = !!((task as any).due_date ?? task.dueDate);

  // Keep the menu on-screen: clamp against the viewport once mounted.
  const [coords, setCoords] = useState({ top: y, left: x });
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let top = y;
    let left = x;
    if (left + rect.width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - rect.width - 8);
    }
    if (top + rect.height > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - rect.height - 8);
    }
    setCoords({ top, left });
  }, [x, y, section]);

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (section === "root") onClose();
        else {
          setSection("root");
          setQuery("");
        }
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, section]);

  useEffect(() => {
    if (section === "assign" || section === "project") {
      const t = setTimeout(() => searchRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [section]);

  const allMembers = members || [];
  const memberIds = useMemo(() => allMembers.map((u) => u.id), [allMembers]);

  const filteredMembers = useMemo(() => {
    const filtered = filterAvailableMembers(allMembers, memberIds, [], query);
    // Surface the current user and Bartok at the top for quick access.
    const priority = (id: string) =>
      id === currentUserId ? 0 : id === BARTOK_USER_ID ? 1 : 2;
    return [...filtered].sort(
      (a, b) =>
        priority(a.id) - priority(b.id) ||
        displayName(a).localeCompare(displayName(b)),
    );
  }, [allMembers, memberIds, query, currentUserId]);

  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    const active = (projects || []).filter((p) => !p.archived);
    if (!q) return active;
    return active.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, query]);

  const item =
    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-zinc-100 transition-colors hover:bg-zinc-800";
  const iconCls = "h-4 w-4 shrink-0 text-zinc-400";

  const assign = (userId: string | null) => {
    onUpdate?.(task.id, { assignedTo: userId, assigned_to: userId } as any);
    onClose();
  };
  const changeProject = (projectId: string) => {
    onUpdate?.(task.id, { projectId, project_id: projectId } as any);
    onClose();
  };
  const changePriority = (priority: number) => {
    onUpdate?.(task.id, { priority } as any);
    onClose();
  };
  const setDue = (date: string | null) => {
    onUpdate?.(task.id, { dueDate: date, due_date: date } as any);
    onClose();
  };

  const body = (() => {
    if (section === "assign") {
      return (
        <>
          <SectionHeader label="Assign to…" onBack={() => setSection("root")} />
          <div className="px-2 pb-2">
            <SearchInput
              ref={searchRef}
              value={query}
              onChange={setQuery}
              placeholder="Search people…"
            />
          </div>
          <div className="max-h-64 overflow-y-auto px-1 pb-1">
            <button type="button" className={item} onClick={() => assign(null)}>
              <UserX className={iconCls} />
              <span>Unassign</span>
              {!currentAssignee ? (
                <Check className="ml-auto h-4 w-4 text-zinc-400" />
              ) : null}
            </button>
            {filteredMembers.length === 0 ? (
              <div className="px-2.5 py-3 text-center text-xs text-zinc-500">
                No people match.
              </div>
            ) : (
              filteredMembers.map((u) => {
                const isCurrent = u.id === currentAssignee;
                return (
                  <button
                    key={u.id}
                    type="button"
                    className={item}
                    onClick={() => assign(u.id)}
                  >
                    <UserAvatar
                      name={displayName(u)}
                      profileColor={u.profileColor}
                      memoji={u.profileMemoji}
                      size={18}
                      className="text-[9px] font-medium"
                    />
                    <span className="truncate">{displayName(u)}</span>
                    {u.id === BARTOK_USER_ID ? (
                      <span className="ml-1 rounded bg-violet-500/20 px-1 text-[9px] uppercase text-violet-300">
                        AI
                      </span>
                    ) : null}
                    {isCurrent ? (
                      <Check className="ml-auto h-4 w-4 shrink-0 text-zinc-400" />
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </>
      );
    }
    if (section === "project") {
      return (
        <>
          <SectionHeader
            label="Change project"
            onBack={() => setSection("root")}
          />
          <div className="px-2 pb-2">
            <SearchInput
              ref={searchRef}
              value={query}
              onChange={setQuery}
              placeholder="Search projects…"
            />
          </div>
          <div className="max-h-64 overflow-y-auto px-1 pb-1">
            {filteredProjects.length === 0 ? (
              <div className="px-2.5 py-3 text-center text-xs text-zinc-500">
                No projects match.
              </div>
            ) : (
              filteredProjects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={item}
                  onClick={() => changeProject(p.id)}
                >
                  <span
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[6px] font-bold text-white"
                    style={{ backgroundColor: p.color }}
                  >
                    {p.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="truncate">{p.name}</span>
                  {p.id === currentProjectId ? (
                    <Check className="ml-auto h-4 w-4 shrink-0 text-zinc-400" />
                  ) : null}
                </button>
              ))
            )}
          </div>
        </>
      );
    }
    if (section === "priority") {
      return (
        <>
          <SectionHeader
            label="Change priority"
            onBack={() => setSection("root")}
          />
          <div className="px-1 pb-1">
            {[1, 2, 3, 4].map((p) => (
              <button
                key={p}
                type="button"
                className={item}
                onClick={() => changePriority(p)}
              >
                <Flag
                  className="h-4 w-4 shrink-0"
                  style={{ color: PRIORITY_FLAG_COLORS[p] }}
                />
                <span>Priority {p}</span>
                {task.priority === p ? (
                  <Check className="ml-auto h-4 w-4 text-zinc-400" />
                ) : null}
              </button>
            ))}
          </div>
        </>
      );
    }
    if (section === "due") {
      const today = new Date();
      const opts: { label: string; date: string | null }[] = [
        { label: "Today", date: format(today, "yyyy-MM-dd") },
        { label: "Tomorrow", date: format(addDays(today, 1), "yyyy-MM-dd") },
        {
          label: "Next week",
          date: format(addDays(today, 7), "yyyy-MM-dd"),
        },
      ];
      return (
        <>
          <SectionHeader label="Due date" onBack={() => setSection("root")} />
          <div className="px-1 pb-1">
            {opts.map((o) => (
              <button
                key={o.label}
                type="button"
                className={item}
                onClick={() => setDue(o.date)}
              >
                <Calendar className={iconCls} />
                <span>{o.label}</span>
              </button>
            ))}
            {hasDueDate ? (
              <button
                type="button"
                className={item}
                onClick={() => setDue(null)}
              >
                <CalendarX2 className={iconCls} />
                <span>Remove due date</span>
              </button>
            ) : null}
          </div>
        </>
      );
    }
    // root
    return (
      <div className="p-1">
        <button
          type="button"
          className={item}
          onClick={() => {
            onToggle(task.id);
            onClose();
          }}
        >
          {isCompleted ? (
            <Circle className={iconCls} />
          ) : (
            <CheckCircle2 className={iconCls} />
          )}
          <span>{isCompleted ? "Reopen task" : "Complete task"}</span>
        </button>
        <button
          type="button"
          className={item}
          onClick={() => {
            onEdit(task);
            onClose();
          }}
        >
          <Edit className={iconCls} />
          <span>Edit task</span>
        </button>

        <div className="my-1 h-px bg-zinc-800" />

        {onUpdate ? (
          <>
            <SubmenuButton
              icon={<UserPlus className={iconCls} />}
              label="Assign to…"
              onClick={() => {
                setQuery("");
                setSection("assign");
              }}
            />
            <SubmenuButton
              icon={<FolderOpen className={iconCls} />}
              label="Change project"
              onClick={() => {
                setQuery("");
                setSection("project");
              }}
            />
            <SubmenuButton
              icon={
                <Flag
                  className="h-4 w-4 shrink-0"
                  style={{ color: PRIORITY_FLAG_COLORS[task.priority] }}
                />
              }
              label="Change priority"
              onClick={() => setSection("priority")}
            />
            <SubmenuButton
              icon={<Calendar className={iconCls} />}
              label="Due date"
              onClick={() => setSection("due")}
            />
          </>
        ) : null}

        {onAddDependency ? (
          <button
            type="button"
            className={item}
            onClick={() => {
              onAddDependency(task);
              onClose();
            }}
          >
            <Link2 className={iconCls} />
            <span>Add dependency</span>
          </button>
        ) : null}

        <div className="my-1 h-px bg-zinc-800" />

        <button
          type="button"
          className={item}
          onClick={() => {
            if (navigator?.clipboard?.writeText) {
              navigator.clipboard.writeText(task.id).catch(() => {});
            }
            onClose();
          }}
        >
          <Copy className={iconCls} />
          <span>Copy task ID</span>
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-red-400 transition-colors hover:bg-red-500/10"
          onClick={() => {
            onDelete(task.id);
            onClose();
          }}
        >
          <Trash2 className="h-4 w-4 shrink-0" />
          <span>Delete task</span>
        </button>
      </div>
    );
  })();

  return createPortal(
    <div
      ref={menuRef}
      style={{ position: "fixed", top: coords.top, left: coords.left }}
      className="z-[200] w-60 rounded-lg border border-zinc-700 bg-zinc-900 py-0.5 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {body}
    </div>,
    document.body,
  );
}

function SubmenuButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-zinc-100 transition-colors hover:bg-zinc-800"
    >
      {icon}
      <span>{label}</span>
      <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-zinc-500" />
    </button>
  );
}

function SectionHeader({
  label,
  onBack,
}: {
  label: string;
  onBack: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="flex w-full items-center gap-1.5 border-b border-zinc-800 px-2.5 py-2 text-left text-xs font-semibold text-zinc-300 hover:text-white"
    >
      <ChevronRight className="h-3.5 w-3.5 rotate-180 text-zinc-500" />
      {label}
    </button>
  );
}

const SearchInput = forwardRef<
  HTMLInputElement,
  { value: string; onChange: (v: string) => void; placeholder: string }
>(function SearchInput({ value, onChange, placeholder }, ref) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-zinc-700 bg-zinc-950 py-1.5 pl-8 pr-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
      />
    </div>
  );
});
