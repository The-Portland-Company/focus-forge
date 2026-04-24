import { Project, Task } from "@/lib/types";

export type ProjectTimelinePoint = {
  date: string;
  completionPct: number;
  completedCount: number;
  totalCount: number;
  completedWork: number;
  totalWork: number;
};

export type ProjectTimelineResult = {
  points: ProjectTimelinePoint[];
  startDate: string;
  endDate: string;
  hasData: boolean;
  usesTimeEstimates: boolean;
  defaultEstimateMinutes: number;
};

type TaskWithSnakeCase = Task & {
  project_id?: string;
  due_date?: string;
  created_at?: string;
  completed_at?: string;
  updated_at?: string;
  time_estimate?: number | null;
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

function taskUpdatedAt(task: TaskWithSnakeCase): string | undefined {
  return task.updated_at || task.updatedAt;
}

function taskEstimate(task: TaskWithSnakeCase): number | null {
  const rawEstimate = task.time_estimate ?? task.timeEstimate ?? null;
  const estimate = Number(rawEstimate);
  return Number.isFinite(estimate) && estimate > 0 ? estimate : null;
}

function getDefaultEstimateMinutes(tasks: TaskWithSnakeCase[]): number {
  const estimates = tasks
    .map(taskEstimate)
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);

  if (estimates.length === 0) return 1;

  const middle = Math.floor(estimates.length / 2);
  if (estimates.length % 2 === 1) return estimates[middle] || 60;

  return Math.round(
    ((estimates[middle - 1] || 60) + (estimates[middle] || 60)) / 2,
  );
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
  const usesTimeEstimates = filteredTasks.some(
    (task) => taskEstimate(task) !== null,
  );
  const defaultEstimateMinutes = getDefaultEstimateMinutes(filteredTasks);
  const getTaskWork = (task: TaskWithSnakeCase) =>
    usesTimeEstimates ? (taskEstimate(task) ?? defaultEstimateMinutes) : 1;

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
    .map((task) => {
      const date = toDate(taskCreatedAt(task));
      return date
        ? { timestamp: startOfLocalDay(date).getTime(), work: getTaskWork(task) }
        : null;
    })
    .filter(
      (value): value is { timestamp: number; work: number } => value !== null,
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  const completedDayStamps = filteredTasks
    .filter((task) => task.completed)
    .map((task) => {
      const date =
        toDate(taskCompletedAt(task)) ||
        toDate(taskUpdatedAt(task)) ||
        toDate(taskCreatedAt(task)) ||
        todayDate;
      return { date, work: getTaskWork(task) };
    })
    .filter(
      (value): value is { date: Date; work: number } => value.date !== null,
    )
    .map((value) => ({
      timestamp: startOfLocalDay(value.date).getTime(),
      work: value.work,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  const points: ProjectTimelinePoint[] = [];
  let createdIndex = 0;
  let completedIndex = 0;
  let runningTotal = 0;
  let runningCompleted = 0;
  let runningTotalWork = 0;
  let runningCompletedWork = 0;

  for (
    let cursor = startDate.getTime();
    cursor <= todayDate.getTime();
    cursor += DAY_MS
  ) {
    while (
      createdIndex < createdDayStamps.length &&
      createdDayStamps[createdIndex].timestamp <= cursor
    ) {
      runningTotal += 1;
      runningTotalWork += createdDayStamps[createdIndex].work;
      createdIndex += 1;
    }

    while (
      completedIndex < completedDayStamps.length &&
      completedDayStamps[completedIndex].timestamp <= cursor
    ) {
      runningCompleted += 1;
      runningCompletedWork += completedDayStamps[completedIndex].work;
      completedIndex += 1;
    }

    const completionPct =
      runningTotalWork === 0
        ? 0
        : clampPercent((runningCompletedWork / runningTotalWork) * 100);

    points.push({
      date: formatDateKey(new Date(cursor)),
      completionPct: Number(completionPct.toFixed(1)),
      completedCount: runningCompleted,
      totalCount: runningTotal,
      completedWork: Number(runningCompletedWork.toFixed(1)),
      totalWork: Number(runningTotalWork.toFixed(1)),
    });
  }

  return {
    points,
    startDate: formatDateKey(startDate),
    endDate: formatDateKey(todayDate),
    hasData: filteredTasks.length > 0,
    usesTimeEstimates,
    defaultEstimateMinutes,
  };
}
