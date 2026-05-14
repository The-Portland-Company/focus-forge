"use client";

import { useMemo, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Clock } from "lucide-react";

interface SnoozePopoverProps {
  trigger: React.ReactNode;
  onSelect: (isoTimestamp: string) => void | Promise<void>;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
}

interface SnoozePreset {
  key: string;
  label: string;
  description: string;
  resolve: (now: Date) => Date;
}

function startOfDay(input: Date) {
  const next = new Date(input);
  next.setHours(0, 0, 0, 0);
  return next;
}

function nextWeekday(now: Date, targetDay: number, hour: number, minute = 0) {
  const next = startOfDay(now);
  const currentDay = next.getDay();
  let delta = targetDay - currentDay;
  if (delta < 0 || (delta === 0 && now.getHours() >= hour)) {
    delta += 7;
  }
  next.setDate(next.getDate() + delta);
  next.setHours(hour, minute, 0, 0);
  return next;
}

const PRESETS: SnoozePreset[] = [
  {
    key: "tomorrow_am",
    label: "Tomorrow morning",
    description: "Tomorrow 8:00 AM",
    resolve: (now) => {
      const next = startOfDay(now);
      next.setDate(next.getDate() + 1);
      next.setHours(8, 0, 0, 0);
      return next;
    },
  },
  {
    key: "tonight",
    label: "Later today",
    description: "Today 6:00 PM",
    resolve: (now) => {
      const next = startOfDay(now);
      next.setHours(18, 0, 0, 0);
      if (next.getTime() <= now.getTime()) {
        // Already past 6pm — push to tomorrow morning instead
        next.setDate(next.getDate() + 1);
        next.setHours(8, 0, 0, 0);
      }
      return next;
    },
  },
  {
    key: "friday_pm",
    label: "Friday afternoon",
    description: "Friday 2:00 PM",
    resolve: (now) => nextWeekday(now, 5, 14, 0),
  },
  {
    key: "next_monday",
    label: "Next Monday",
    description: "Monday 8:00 AM",
    resolve: (now) => nextWeekday(now, 1, 8, 0),
  },
  {
    key: "next_week",
    label: "In a week",
    description: "Same time, +7 days",
    resolve: (now) => {
      const next = new Date(now);
      next.setDate(next.getDate() + 7);
      return next;
    },
  },
];

function formatPresetTimestamp(date: Date): string {
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SnoozePopover({
  trigger,
  onSelect,
  align = "end",
  side = "bottom",
}: SnoozePopoverProps) {
  const [open, setOpen] = useState(false);
  const [customValue, setCustomValue] = useState<string>("");

  const presetItems = useMemo(() => {
    const now = new Date();
    return PRESETS.map((preset) => {
      const resolved = preset.resolve(now);
      return {
        ...preset,
        resolved,
        formatted: formatPresetTimestamp(resolved),
      };
    });
    // Recompute presets whenever the popover toggles so "tomorrow" stays fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handlePreset = async (iso: string) => {
    await onSelect(iso);
    setOpen(false);
  };

  const handleCustomSubmit = async () => {
    if (!customValue) return;
    const parsed = new Date(customValue);
    if (Number.isNaN(parsed.getTime())) return;
    await onSelect(parsed.toISOString());
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align={align}
          side={side}
          sideOffset={6}
          className="z-50 w-72 rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-xl"
        >
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
            <Clock className="h-3.5 w-3.5" />
            Snooze until
          </div>
          <div className="flex flex-col gap-1">
            {presetItems.map((preset) => (
              <button
                key={preset.key}
                type="button"
                onClick={() => handlePreset(preset.resolved.toISOString())}
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm text-zinc-200 transition-colors hover:bg-zinc-800"
              >
                <span>{preset.label}</span>
                <span className="text-xs text-zinc-500">{preset.formatted}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 border-t border-zinc-800 pt-3">
            <label className="flex flex-col gap-2 text-xs text-zinc-400">
              <span>Custom date &amp; time</span>
              <input
                type="datetime-local"
                value={customValue}
                onChange={(event) => setCustomValue(event.target.value)}
                className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-white outline-none focus:border-theme-primary"
              />
            </label>
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                disabled={!customValue}
                onClick={handleCustomSubmit}
                className="rounded-md bg-theme-primary px-3 py-1.5 text-xs font-medium text-zinc-950 transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
              >
                Snooze
              </button>
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
