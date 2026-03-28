import { Project, Task } from "@/lib/types";

export type ProjectTimelinePoint = {
  date: string;
  completionPct: number;
  completedCount: number;
  totalCount: number;
};

export type ProjectTimelineResult = {
  points: ProjectTimelinePoint[];
  startDate: string;
  endDate: string;
  hasData: boolean;
};

type TaskWithSnakeCase = Task & {
  project_id?: string;
  due_date?: string;
  created_at?: string;
  completed_at?: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(value?: string | null): Date | null {
  if (!value) return null;
  const localDateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (localDateMatch) {
    const [, year, month, day] = localDateMatch;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function taskProjectId(task: TaskWithSnakeCase): string | undefined {
  return task.project_id || task.projectId;
}

function taskDueDate(task: TaskWithSnakeCase): string | undefined {
  return task.due_date || task.dueDate;
}

function taskCreatedAt(task: TaskWithSnakeCase): string | undefined {
  return task.created_at || task.createdAt;
}

function taskCompletedAt(task: TaskWithSnakeCase): string | undefined {
  return task.completed_at || task.completedAt;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function buildProjectProgressTimeline(
  project: Project,
  projectTasks: Task[],
  today: Date = new Date(),
): ProjectTimelineResult {
  const todayDate = startOfLocalDay(today);
  const typedTasks = projectTasks as TaskWithSnakeCase[];
  const filteredTasks = typedTasks.filter(
    (task) => taskProjectId(task) === project.id,
  );

  const dueDates = filteredTasks
    .map((task) => toDate(taskDueDate(task)))
    .filter((value): value is Date => value !== null)
    .map(startOfLocalDay);

  const earliestDueDate =
    dueDates.length > 0
      ? new Date(Math.min(...dueDates.map((date) => date.getTime())))
      : null;

  const projectCreated =
    toDate((project as any).created_at) || toDate(project.createdAt) || todayDate;

  let startDate = earliestDueDate
    ? new Date(Math.min(todayDate.getTime(), earliestDueDate.getTime()))
    : startOfLocalDay(projectCreated);

  if (startDate.getTime() > todayDate.getTime()) {
    startDate = todayDate;
  }

  const createdDayStamps = filteredTasks
    .map((task) => toDate(taskCreatedAt(task)))
    .filter((value): value is Date => value !== null)
    .map(startOfLocalDay)
    .map((date) => date.getTime())
    .sort((a, b) => a - b);

  const completedDayStamps = filteredTasks
    .filter((task) => task.completed)
    .map((task) => toDate(taskCompletedAt(task)))
    .filter((value): value is Date => value !== null)
    .map(startOfLocalDay)
    .map((date) => date.getTime())
    .sort((a, b) => a - b);

  const points: ProjectTimelinePoint[] = [];
  let createdIndex = 0;
  let completedIndex = 0;
  let runningTotal = 0;
  let runningCompleted = 0;

  for (
    let cursor = startDate.getTime();
    cursor <= todayDate.getTime();
    cursor += DAY_MS
  ) {
    while (
      createdIndex < createdDayStamps.length &&
      createdDayStamps[createdIndex] <= cursor
    ) {
      runningTotal += 1;
      createdIndex += 1;
    }

    while (
      completedIndex < completedDayStamps.length &&
      completedDayStamps[completedIndex] <= cursor
    ) {
      runningCompleted += 1;
      completedIndex += 1;
    }

    const completionPct =
      runningTotal === 0
        ? 0
        : clampPercent((runningCompleted / runningTotal) * 100);

    points.push({
      date: formatDateKey(new Date(cursor)),
      completionPct: Number(completionPct.toFixed(1)),
      completedCount: runningCompleted,
      totalCount: runningTotal,
    });
  }

  return {
    points,
    startDate: formatDateKey(startDate),
    endDate: formatDateKey(todayDate),
    hasData: filteredTasks.length > 0,
  };
}
