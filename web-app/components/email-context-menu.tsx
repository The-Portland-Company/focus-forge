"use client";

import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Archive,
  Ban,
  Check,
  ChevronRight,
  Clock,
  Filter,
  Flag,
  FolderOpen,
  FolderSearch,
  Mail,
  MailOpen,
  MailX,
  Search,
  ShieldAlert,
  ShieldCheck,
  SquareCheckBig,
  Trash2,
  UserX,
} from "lucide-react";
import type { ThreadAction } from "@/lib/email-inbox/thread-actions";
import {
  PRIORITY_LABELS,
  PRIORITY_LEVELS,
  getPriorityFlagColors,
} from "@/lib/priority-colors";
import type { InboxItem, Project } from "@/lib/types";

type Section = "root" | "snooze" | "project" | "priority";

export interface EmailContextMenuProps {
  item: InboxItem;
  x: number;
  y: number;
  projects?: Project[];
  onClose: () => void;
  onOpen?: (item: InboxItem) => void;
  onThreadAction?: (
    item: InboxItem,
    action: ThreadAction,
    options?: {
      snoozedUntil?: string;
      boomerangUntil?: string;
      boomerangTaskId?: string;
    },
  ) => Promise<void> | void;
  onUnsubscribe?: (item: InboxItem) => void;
  onMoveToProject?: (item: InboxItem, projectId: string) => void;
  /** Opens the full type-to-search project picker (with suggestions). */
  onAssignProject?: (item: InboxItem) => void;
  /** Opens the rule builder prefilled from this email. */
  onCreateRule?: (item: InboxItem) => void;
  /** Sets (or clears, with null) this email's 1..4 priority. */
  onSetPriority?: (item: InboxItem, priority: number | null) => void;
  /** The signed-in user's custom priority hue, if they set one. */
  priorityColor?: string | null;
}

/**
 * Cursor-anchored right-click menu for an inbox row. Mirrors TaskContextMenu's
 * portal-popover pattern (fixed position, viewport clamp, outside-click +
 * Escape close, back-navigable submenus) and drives every mutation through the
 * callbacks the row already threads to email-inbox-view — no new endpoints.
 */
export function EmailContextMenu({
  item,
  x,
  y,
  projects,
  onClose,
  onOpen,
  onThreadAction,
  onUnsubscribe,
  onMoveToProject,
  onAssignProject,
  onCreateRule,
  onSetPriority,
  priorityColor,
}: EmailContextMenuProps) {
  const priorityColors = useMemo(
    () => getPriorityFlagColors(priorityColor),
    [priorityColor],
  );
  const [section, setSection] = useState<Section>("root");
  const [query, setQuery] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const isUnread = Boolean(item.isUnread);
  const isSpam = item.status === "spam" || item.classification === "spam";
  const currentProjectId =
    (item as any).projectId ?? (item as any).project_id ?? null;

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
    if (section === "project") {
      const t = setTimeout(() => searchRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [section]);

  const filteredProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    const active = (projects || []).filter((p) => !p.archived);
    if (!q) return active;
    return active.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, query]);

  const item_ =
    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-zinc-100 transition-colors hover:bg-zinc-800";
  const iconCls = "h-4 w-4 shrink-0 text-zinc-400";

  const run = (action: ThreadAction, options?: { snoozedUntil?: string }) => {
    void onThreadAction?.(item, action, options);
    onClose();
  };

  // Snooze presets. Computed at render from the local clock.
  const snoozeOptions = useMemo(() => {
    const now = new Date();
    const at = (base: Date, h: number, m = 0) => {
      const d = new Date(base);
      d.setHours(h, m, 0, 0);
      return d;
    };
    const laterToday = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    const thisEvening = at(now, 18);
    const tomorrow = at(new Date(now.getTime() + 24 * 60 * 60 * 1000), 9);
    const nextWeek = at(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), 9);
    const opts: { label: string; date: Date }[] = [
      { label: "Later today (+3h)", date: laterToday },
    ];
    if (thisEvening.getTime() > now.getTime() + 30 * 60 * 1000) {
      opts.push({ label: "This evening (6 PM)", date: thisEvening });
    }
    opts.push({ label: "Tomorrow (9 AM)", date: tomorrow });
    opts.push({ label: "Next week", date: nextWeek });
    return opts;
  }, []);

  const body = (() => {
    if (section === "snooze") {
      return (
        <>
          <SectionHeader label="Snooze until…" onBack={() => setSection("root")} />
          <div className="px-1 pb-1">
            {snoozeOptions.map((o) => (
              <button
                key={o.label}
                type="button"
                className={item_}
                onClick={() =>
                  run("snooze", { snoozedUntil: o.date.toISOString() })
                }
              >
                <Clock className={iconCls} />
                <span>{o.label}</span>
              </button>
            ))}
          </div>
        </>
      );
    }
    if (section === "priority") {
      return (
        <>
          <SectionHeader
            label="Priority"
            onBack={() => setSection("root")}
          />
          <div className="px-1 pb-1">
            {PRIORITY_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                className={item_}
                onClick={() => {
                  onSetPriority?.(item, level);
                  onClose();
                }}
              >
                <Flag
                  className="h-4 w-4 shrink-0"
                  style={{ color: priorityColors[level] }}
                />
                <span>
                  P{level} · {PRIORITY_LABELS[level]}
                </span>
                {item.priority === level ? (
                  <Check className="ml-auto h-4 w-4 shrink-0 text-zinc-400" />
                ) : null}
              </button>
            ))}
            {item.priority ? (
              <button
                type="button"
                className={item_}
                onClick={() => {
                  onSetPriority?.(item, null);
                  onClose();
                }}
              >
                <Flag className={iconCls} />
                <span>Clear priority</span>
              </button>
            ) : null}
          </div>
        </>
      );
    }
    if (section === "project") {
      return (
        <>
          <SectionHeader
            label="Move to project"
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
                  className={item_}
                  onClick={() => {
                    onMoveToProject?.(item, p.id);
                    onClose();
                  }}
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
    // root
    return (
      <div className="p-1">
        {onOpen ? (
          <button
            type="button"
            className={item_}
            onClick={() => {
              onOpen(item);
              onClose();
            }}
          >
            <Mail className={iconCls} />
            <span>Open email</span>
          </button>
        ) : null}
        <button
          type="button"
          className={item_}
          onClick={() => run("mark_read")}
        >
          {isUnread ? (
            <MailOpen className={iconCls} />
          ) : (
            <Mail className={iconCls} />
          )}
          <span>{isUnread ? "Mark as read" : "Mark as unread"}</span>
        </button>

        <div className="my-1 h-px bg-zinc-800" />

        <button type="button" className={item_} onClick={() => run("to_task")}>
          <SquareCheckBig className={iconCls} />
          <span>Convert to task</span>
        </button>
        {onSetPriority ? (
          <SubmenuButton
            icon={
              <Flag
                className="h-4 w-4 shrink-0"
                style={{
                  color: item.priority
                    ? priorityColors[item.priority]
                    : undefined,
                }}
              />
            }
            label={
              item.priority
                ? `Priority: P${item.priority} · ${PRIORITY_LABELS[item.priority]}`
                : "Priority"
            }
            onClick={() => setSection("priority")}
          />
        ) : null}
        <SubmenuButton
          icon={<Clock className={iconCls} />}
          label="Snooze"
          onClick={() => setSection("snooze")}
        />
        {onMoveToProject ? (
          <SubmenuButton
            icon={<FolderOpen className={iconCls} />}
            label="Move to project"
            onClick={() => {
              setQuery("");
              setSection("project");
            }}
          />
        ) : null}
        {onAssignProject ? (
          <button
            type="button"
            className={item_}
            onClick={() => {
              onAssignProject(item);
              onClose();
            }}
          >
            <FolderSearch className={iconCls} />
            <span>Assign to project…</span>
          </button>
        ) : null}
        {onCreateRule ? (
          <button
            type="button"
            className={item_}
            onClick={() => {
              onCreateRule(item);
              onClose();
            }}
          >
            <Filter className={iconCls} />
            <span>Create rule…</span>
          </button>
        ) : null}

        <div className="my-1 h-px bg-zinc-800" />

        <button type="button" className={item_} onClick={() => run("archive")}>
          <Archive className={iconCls} />
          <span>Archive</span>
        </button>
        <button
          type="button"
          className={item_}
          onClick={() => run("quarantine")}
        >
          <ShieldAlert className={iconCls} />
          <span>Quarantine</span>
        </button>
        {isSpam ? (
          <button
            type="button"
            className={item_}
            onClick={() => run("approve")}
          >
            <ShieldCheck className={iconCls} />
            <span>Not spam</span>
          </button>
        ) : (
          <button type="button" className={item_} onClick={() => run("spam")}>
            <Ban className={iconCls} />
            <span>Mark as spam</span>
          </button>
        )}
        {onUnsubscribe ? (
          <button
            type="button"
            className={item_}
            onClick={() => {
              onUnsubscribe(item);
              onClose();
            }}
          >
            <MailX className={iconCls} />
            <span>Unsubscribe</span>
          </button>
        ) : null}

        <div className="my-1 h-px bg-zinc-800" />

        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-red-400 transition-colors hover:bg-red-500/10"
          onClick={() => run("delete")}
        >
          <Trash2 className="h-4 w-4 shrink-0" />
          <span>Delete</span>
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm text-red-400 transition-colors hover:bg-red-500/10"
          onClick={() => run("always_delete_sender")}
        >
          <UserX className="h-4 w-4 shrink-0" />
          <span>Always delete sender</span>
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
