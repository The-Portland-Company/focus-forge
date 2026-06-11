"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  History,
  Trash2,
} from "lucide-react";
import {
  EntityEvent,
  describeEvent,
  eventTimeRange,
  reconstructAt,
} from "@/lib/history-timeline";

type HistoryScope =
  | { entityType: string; entityId: string }
  | { projectId: string }
  | { organizationId: string };

type HistoryTimelineScrubberProps = {
  scope: HistoryScope;
  title?: string;
  description?: string;
  className?: string;
  /**
   * When false, the panel is always expanded and the chevron collapse toggle
   * is hidden (used when an external trigger, e.g. a top-right icon button,
   * already controls visibility). Defaults to true.
   */
  collapsible?: boolean;
};

const SLIDER_STEPS = 500;

function buildQuery(scope: HistoryScope): string {
  const params = new URLSearchParams();
  if ("entityId" in scope) {
    params.set("entityType", scope.entityType);
    params.set("entityId", scope.entityId);
  } else if ("projectId" in scope) {
    params.set("projectId", scope.projectId);
  } else {
    params.set("organizationId", scope.organizationId);
  }
  return params.toString();
}

export function HistoryTimelineScrubber({
  scope,
  title = "History Timeline",
  description,
  className,
  collapsible = true,
}: HistoryTimelineScrubberProps) {
  const [events, setEvents] = useState<EntityEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sliderValue, setSliderValue] = useState(SLIDER_STEPS);
  const [collapsedState, setCollapsed] = useState(false);
  const collapsed = collapsible ? collapsedState : false;

  useEffect(() => {
    if (typeof window === "undefined" || !collapsible) return;
    setCollapsed(
      window.localStorage.getItem("history-scrubber-collapsed") === "true",
    );
  }, [collapsible]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          "history-scrubber-collapsed",
          String(next),
        );
      }
      return next;
    });
  };

  const query = buildQuery(scope);

  useEffect(() => {
    let cancelled = false;
    setEvents(null);
    setError(null);
    setSliderValue(SLIDER_STEPS);

    fetch(`/api/history?${query}`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            (await response.json().catch(() => null))?.error ||
              "Failed to load history",
          );
        }
        return response.json();
      })
      .then((payload) => {
        if (!cancelled) setEvents(payload.events || []);
      })
      .catch((fetchError) => {
        if (!cancelled) setError(fetchError.message);
      });

    return () => {
      cancelled = true;
    };
  }, [query]);

  const range = useMemo(
    () => (events ? eventTimeRange(events) : null),
    [events],
  );

  const selectedTime = useMemo(() => {
    if (!range) return new Date();
    const span = range.end.getTime() - range.start.getTime();
    // Land slightly past the last event so the "now" position includes it
    return new Date(
      range.start.getTime() + (span * sliderValue) / SLIDER_STEPS + 1000,
    );
  }, [range, sliderValue]);

  const state = useMemo(
    () => (events ? reconstructAt(events, selectedTime) : null),
    [events, selectedTime],
  );

  const visibleEvents = useMemo(() => {
    if (!events) return [];
    const tMs = selectedTime.getTime();
    return [...events]
      .filter((event) => new Date(event.occurred_at).getTime() <= tMs)
      .sort(
        (a, b) =>
          new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
      )
      .slice(0, 8);
  }, [events, selectedTime]);

  const taskStates = useMemo(() => {
    if (!state) return [];
    return Array.from(state.entities.values())
      .filter((entity) => entity.entityType === "task")
      .sort((a, b) => {
        const an = (a.snapshot?.name as string) || "";
        const bn = (b.snapshot?.name as string) || "";
        return an.localeCompare(bn);
      });
  }, [state]);

  return (
    <section
      className={`rounded-lg border border-zinc-800 bg-zinc-900/70 p-3 ${className || ""}`}
      aria-label={title}
      data-testid="history-timeline-scrubber"
    >
      <div
        className={`flex items-center justify-between gap-2 ${collapsed ? "" : description ? "mb-1" : "mb-3"}`}
      >
        {collapsible ? (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            className="group flex items-center gap-2 text-left"
          >
            <ChevronRight
              className={`h-4 w-4 text-zinc-500 transition-transform group-hover:text-zinc-300 ${collapsed ? "" : "rotate-90"}`}
            />
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-300">
              <History className="h-4 w-4" />
              {title}
            </h2>
          </button>
        ) : (
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-zinc-300">
            <History className="h-4 w-4" />
            {title}
          </h2>
        )}
        {!collapsed && range && (
          <span className="rounded-md border border-zinc-700 bg-zinc-800/80 px-2 py-1 text-xs text-zinc-200">
            <Clock className="mr-1 inline h-3 w-3" />
            {format(selectedTime, "MMM d, yyyy h:mm a")}
          </span>
        )}
      </div>

      {!collapsed && description && (
        <p className="mb-3 text-xs text-zinc-500">{description}</p>
      )}

      {!collapsed && (
        <>
      {error && (
        <p className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {!error && events === null && (
        <p className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-5 text-center text-sm text-zinc-500">
          Loading history…
        </p>
      )}

      {!error && events !== null && events.length === 0 && (
        <p className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-5 text-center text-sm text-zinc-500">
          No history recorded yet. Changes from now on are tracked
          automatically.
        </p>
      )}

      {!error && events !== null && events.length > 0 && range && state && (
        <>
          <div className="mb-3">
            <input
              type="range"
              min={0}
              max={SLIDER_STEPS}
              value={sliderValue}
              onChange={(changeEvent) =>
                setSliderValue(Number(changeEvent.target.value))
              }
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 accent-orange-500"
              aria-label="Scrub through history"
              data-testid="history-slider"
            />
            <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
              <span>{format(range.start, "MMM d, yyyy")}</span>
              <span>{format(range.end, "MMM d, yyyy")}</span>
            </div>
          </div>

          {taskStates.length > 0 && (
            <ul className="mb-3 max-h-56 space-y-1 overflow-y-auto">
              {taskStates.map((entity) => {
                const name =
                  (entity.snapshot?.name as string) || entity.entityId;
                const isGone = !entity.present && !entity.deleted;
                const notYetCreated = !entity.lastEvent;
                if (notYetCreated || isGone) return null;
                return (
                  <li
                    key={entity.entityId}
                    className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm ${
                      entity.deleted
                        ? "border-red-900/50 bg-red-950/30 text-red-300/80"
                        : entity.completed
                          ? "border-zinc-800 bg-zinc-950/60 text-zinc-500 line-through"
                          : "border-zinc-800 bg-zinc-950/60 text-zinc-200"
                    }`}
                  >
                    {entity.deleted ? (
                      <Trash2 className="h-3.5 w-3.5 shrink-0" />
                    ) : entity.completed ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                    )}
                    <span className="truncate">{name}</span>
                    {entity.deleted && (
                      <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide">
                        deleted
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Events up to this point
            </h3>
            <ul className="space-y-0.5 text-xs text-zinc-400">
              {visibleEvents.map((event) => (
                <li key={event.id} className="flex items-baseline gap-2">
                  <span className="shrink-0 tabular-nums text-zinc-600">
                    {format(new Date(event.occurred_at), "MMM d, h:mm a")}
                  </span>
                  <span className="truncate">{describeEvent(event)}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
        </>
      )}
    </section>
  );
}
