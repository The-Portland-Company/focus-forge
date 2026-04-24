"use client";

import { useMemo, useState, type MouseEvent } from "react";
import { format } from "date-fns";
import { Project, Task } from "@/lib/types";
import {
  ProjectTimelinePoint,
  buildProjectProgressTimeline,
} from "@/lib/progress-timeline";

type ProjectProgressTimelineProps = {
  project: Project;
  tasks: Task[];
  today?: Date;
};

const CHART_WIDTH = 860;
const CHART_HEIGHT = 132;
const PADDING = { top: 12, right: 14, bottom: 24, left: 40 };

function getTickIndices(total: number, maxTicks = 6): number[] {
  if (total <= 0) return [];
  if (total <= maxTicks) return Array.from({ length: total }, (_, idx) => idx);

  const step = (total - 1) / (maxTicks - 1);
  const ticks = new Set<number>([0, total - 1]);
  for (let i = 1; i < maxTicks - 1; i += 1) {
    ticks.add(Math.round(i * step));
  }
  return [...ticks].sort((a, b) => a - b);
}

function xPosition(index: number, total: number): number {
  if (total <= 1) return PADDING.left;
  const usableWidth = CHART_WIDTH - PADDING.left - PADDING.right;
  return PADDING.left + (index / (total - 1)) * usableWidth;
}

function yPosition(percentage: number): number {
  const usableHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  return PADDING.top + ((100 - percentage) / 100) * usableHeight;
}

function toDisplayDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  return format(date, "MMM d, yyyy");
}

function fromDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function buildPath(points: ProjectTimelinePoint[]): string {
  if (points.length === 0) return "";
  return points
    .map((point, idx) => {
      const command = idx === 0 ? "M" : "L";
      return `${command}${xPosition(idx, points.length)} ${yPosition(point.completionPct)}`;
    })
    .join(" ");
}

function pluralizeTask(count: number): string {
  return count === 1 ? "task" : "tasks";
}

function formatWork(value: number, usesTimeEstimates: boolean): string {
  if (!usesTimeEstimates) {
    const rounded = Math.round(value);
    return `${rounded} ${pluralizeTask(rounded)}`;
  }

  const totalMinutes = Math.max(0, Math.round(value));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

function getTaskProjectId(task: Task): string | undefined {
  return (task as Task & { project_id?: string }).project_id || task.projectId;
}

export function ProjectProgressTimeline({
  project,
  tasks,
  today,
}: ProjectProgressTimelineProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const timeline = useMemo(
    () => buildProjectProgressTimeline(project, tasks, today),
    [project, tasks, today],
  );

  const points = timeline.points;
  const latestPoint = points[points.length - 1];
  const projectTasks = useMemo(
    () => tasks.filter((task) => getTaskProjectId(task) === project.id),
    [project.id, tasks],
  );
  const totalTasks = projectTasks.length;
  const completedTasks = projectTasks.filter((task) => task.completed).length;
  const completedWork = latestPoint?.completedWork ?? completedTasks;
  const totalWork = latestPoint?.totalWork ?? totalTasks;
  const remainingWork = Math.max(0, totalWork - completedWork);
  const completionPct = latestPoint?.completionPct ?? 0;
  const progressBarPct = Math.min(100, Math.max(0, completionPct));
  const tickIndices = useMemo(() => getTickIndices(points.length), [points.length]);
  const linePath = useMemo(() => buildPath(points), [points]);

  const effectiveIndex =
    activeIndex !== null && activeIndex >= 0 && activeIndex < points.length
      ? activeIndex
      : points.length - 1;

  const activePoint = points[effectiveIndex];
  const activeX = activePoint ? xPosition(effectiveIndex, points.length) : null;
  const activeY = activePoint ? yPosition(activePoint.completionPct) : null;

  const handleMouseMove = (event: MouseEvent<SVGSVGElement>) => {
    if (points.length === 0) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const minX = PADDING.left;
    const maxX = CHART_WIDTH - PADDING.right;
    const clamped = Math.min(Math.max(x, minX), maxX);
    const ratio = (clamped - minX) / (maxX - minX || 1);
    const index = Math.round(ratio * (points.length - 1));
    setActiveIndex(index);
  };

  const hasTasks = totalTasks > 0;

  return (
    <section
      className="mb-4 rounded-lg border border-zinc-800 bg-zinc-900/70 p-3"
      aria-label={`Progress timeline for ${project.name}`}
    >
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">
          Progress Timeline
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-md border border-zinc-700 bg-zinc-800/80 px-2 py-1 text-zinc-200">
            {timeline.usesTimeEstimates ? "Estimated work" : "Task count"}
          </span>
          <span className="rounded-md border border-zinc-700 bg-zinc-800/80 px-2 py-1 text-zinc-200">
            Done: {formatWork(completedWork, timeline.usesTimeEstimates)}
          </span>
          <span className="rounded-md border border-zinc-700 bg-zinc-800/80 px-2 py-1 text-zinc-200">
            Remaining: {formatWork(remainingWork, timeline.usesTimeEstimates)}
          </span>
          <span className="rounded-md border border-zinc-700 bg-zinc-800/80 px-2 py-1 text-zinc-200">
            Tasks: {completedTasks}/{totalTasks}
          </span>
        </div>
      </div>

      {!hasTasks ? (
        <p className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-5 text-center text-sm text-zinc-500">
          No tasks yet for this project.
        </p>
      ) : (
        <div className="relative">
          <div className="mb-3">
            <div className="mb-1 flex items-center justify-between text-xs text-zinc-400">
              <span>Current progress</span>
              <span>{progressBarPct.toFixed(1)}%</span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-zinc-800"
              role="progressbar"
              aria-label={`Current project completion for ${project.name}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Number(progressBarPct.toFixed(1))}
            >
              <div
                className="h-full rounded-full bg-[rgb(var(--theme-primary-rgb))] transition-[width] duration-300 ease-out"
                style={{ width: `${progressBarPct}%` }}
              />
            </div>
          </div>

          <svg
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            className="h-32 w-full"
            role="img"
            aria-label="Project completion percentage over time"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setActiveIndex(null)}
          >
            {[0, 25, 50, 75, 100].map((value) => {
              const y = yPosition(value);
              return (
                <g key={value}>
                  <line
                    x1={PADDING.left}
                    y1={y}
                    x2={CHART_WIDTH - PADDING.right}
                    y2={y}
                    stroke="rgba(63, 63, 70, 0.7)"
                    strokeWidth="1"
                  />
                  <text
                    x={PADDING.left - 8}
                    y={y + 4}
                    fontSize="10"
                    fill="#9ca3af"
                    textAnchor="end"
                  >
                    {value}%
                  </text>
                </g>
              );
            })}

            {tickIndices.map((idx) => {
              const point = points[idx];
              const x = xPosition(idx, points.length);
              return (
                <g key={point.date}>
                  <text
                    x={x}
                    y={CHART_HEIGHT - 10}
                    fontSize="10"
                    fill="#9ca3af"
                    textAnchor="middle"
                  >
                    {format(
                      fromDateKey(point.date),
                      points.length > 120 ? "MMM yy" : "MMM d",
                    )}
                  </text>
                  <circle
                    cx={x}
                    cy={CHART_HEIGHT - PADDING.bottom + 6}
                    r="7"
                    fill="transparent"
                    tabIndex={0}
                    role="button"
                    aria-label={`${toDisplayDate(point.date)} completion ${point.completionPct.toFixed(1)} percent`}
                    onFocus={() => setActiveIndex(idx)}
                    onBlur={() => setActiveIndex(null)}
                  />
                </g>
              );
            })}

            <path d={linePath} fill="none" stroke="#60a5fa" strokeWidth="2.5" />

            {activePoint && activeX !== null && activeY !== null && (
              <>
                <line
                  x1={activeX}
                  y1={PADDING.top}
                  x2={activeX}
                  y2={CHART_HEIGHT - PADDING.bottom}
                  stroke="rgba(96,165,250,0.45)"
                  strokeWidth="1"
                />
                <circle
                  cx={activeX}
                  cy={activeY}
                  r="3.5"
                  fill="#60a5fa"
                  stroke="#0a0a0a"
                  strokeWidth="1"
                />
              </>
            )}
          </svg>

          {activePoint && activeX !== null && (
            <div
              className="pointer-events-none absolute -translate-x-1/2 rounded-md border border-zinc-700 bg-zinc-950/95 px-2 py-1 text-xs text-zinc-200 shadow-lg"
              style={{
                left: `${(activeX / CHART_WIDTH) * 100}%`,
                top: "8px",
              }}
            >
              <div className="font-medium">{toDisplayDate(activePoint.date)}</div>
              <div>
                {activePoint.completionPct.toFixed(1)}% complete
                {activePoint.date === latestPoint?.date
                  ? ` (${completionPct.toFixed(1)}% current)`
                  : ""}
              </div>
              <div>
                {formatWork(activePoint.completedWork, timeline.usesTimeEstimates)}
                /{formatWork(activePoint.totalWork, timeline.usesTimeEstimates)}
              </div>
              <div className="text-zinc-500">
                {activePoint.completedCount}/{activePoint.totalCount} tasks
              </div>
            </div>
          )}

          <p className="mt-2 text-xs text-zinc-500">
            {timeline.startDate} to {timeline.endDate}
          </p>
        </div>
      )}
    </section>
  );
}
