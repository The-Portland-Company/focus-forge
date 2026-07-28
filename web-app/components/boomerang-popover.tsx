"use client";

import { useMemo, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Send, Clock, CheckSquare, Loader2 } from "lucide-react";

type LinkedTask = { id: string; name: string };

export interface BoomerangResult {
  boomerangUntil?: string;
  boomerangTaskId?: string;
}

interface BoomerangPopoverProps {
  trigger: React.ReactNode;
  threadId: string;
  /** Whether the thread has any linked tasks (to fetch on open). */
  hasLinkedTasks?: boolean;
  onSelect: (result: BoomerangResult) => void | Promise<void>;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
}

function startOfDay(input: Date) {
  const next = new Date(input);
  next.setHours(0, 0, 0, 0);
  return next;
}

const PRESETS: { key: string; label: string; resolve: (now: Date) => Date }[] = [
  {
    key: "later",
    label: "Later today (6 PM)",
    resolve: (now) => {
      const d = startOfDay(now);
      d.setHours(18, 0, 0, 0);
      if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
      return d;
    },
  },
  {
    key: "tomorrow",
    label: "Tomorrow morning",
    resolve: (now) => {
      const d = startOfDay(now);
      d.setDate(d.getDate() + 1);
      d.setHours(8, 0, 0, 0);
      return d;
    },
  },
  {
    key: "weekend",
    label: "This weekend (Sat)",
    resolve: (now) => {
      const d = startOfDay(now);
      const delta = (6 - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + delta);
      d.setHours(8, 0, 0, 0);
      return d;
    },
  },
  {
    key: "nextweek",
    label: "Next week (Mon)",
    resolve: (now) => {
      const d = startOfDay(now);
      const delta = (1 - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + delta);
      d.setHours(8, 0, 0, 0);
      return d;
    },
  },
];

/**
 * "Boomerang" an email out of the inbox until a date/time OR until a linked
 * task is completed. Modeled on the snooze popover, plus a task selector.
 */
export function BoomerangPopover({
  trigger,
  threadId,
  hasLinkedTasks,
  onSelect,
  align = "end",
  side = "top",
}: BoomerangPopoverProps) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [tasks, setTasks] = useState<LinkedTask[] | null>(null);
  const [loadingTasks, setLoadingTasks] = useState(false);

  const minCustom = useMemo(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }, []);

  const choose = async (result: BoomerangResult) => {
    setOpen(false);
    await onSelect(result);
  };

  const loadTasks = async () => {
    if (tasks || !hasLinkedTasks) return;
    setLoadingTasks(true);
    try {
      const res = await fetch(`/api/email/threads/${threadId}/tasks`, {
        credentials: "include",
      });
      const data = await res.json();
      const list: LinkedTask[] = (data?.tasks || data || [])
        .filter((t: any) => !t.completed)
        .map((t: any) => ({ id: t.id, name: t.name || "Untitled task" }));
      setTasks(list);
    } catch {
      setTasks([]);
    } finally {
      setLoadingTasks(false);
    }
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void loadTasks();
      }}
    >
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align={align}
          side={side}
          sideOffset={6}
          className="z-[60] w-72 rounded-xl border border-zinc-800 bg-zinc-950 p-2 text-sm text-zinc-200 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-zinc-400">
            <Send className="h-3.5 w-3.5" />
            Remove from inbox until…
          </div>

          {/* Date/time presets */}
          <div className="mt-1 space-y-0.5">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() =>
                  choose({ boomerangUntil: p.resolve(new Date()).toISOString() })
                }
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-zinc-800"
              >
                <Clock className="h-3.5 w-3.5 text-zinc-500" />
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom date/time */}
          <div className="mt-1 flex items-center gap-1.5 px-2 py-1">
            <input
              type="datetime-local"
              min={minCustom}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              className="h-8 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-xs text-white"
            />
            <button
              type="button"
              disabled={!custom}
              onClick={() => {
                const parsed = new Date(custom);
                if (!Number.isNaN(parsed.getTime()))
                  void choose({ boomerangUntil: parsed.toISOString() });
              }}
              className="h-8 rounded-lg bg-theme-gradient px-3 text-xs font-medium text-white disabled:opacity-50"
            >
              Set
            </button>
          </div>

          {/* Until a task is completed */}
          <div className="mt-1 border-t border-zinc-800 pt-1">
            <div className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-zinc-400">
              <CheckSquare className="h-3.5 w-3.5" />
              Until a task is completed
            </div>
            {loadingTasks ? (
              <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-zinc-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading tasks…
              </div>
            ) : tasks && tasks.length > 0 ? (
              <div className="max-h-40 space-y-0.5 overflow-auto">
                {tasks.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => choose({ boomerangTaskId: t.id })}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-zinc-800"
                  >
                    <CheckSquare className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                    <span className="truncate">{t.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-2 py-1.5 text-xs text-zinc-600">
                {hasLinkedTasks
                  ? "No open linked tasks."
                  : "Convert this email to a task first, then boomerang until it's done."}
              </div>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
