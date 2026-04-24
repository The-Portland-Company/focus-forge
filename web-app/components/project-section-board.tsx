"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  AlertCircle,
  Bot,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  Edit,
  Flag,
  Plus,
  Square,
  CheckSquare,
  Trash2,
} from "lucide-react";
import { Database, Section, Task } from "@/lib/types";
import { getBlockedTaskIds } from "@/lib/dependency-utils";
import { richTextToPlainText } from "@/lib/rich-text";
import { UserAvatar } from "@/components/user-avatar";

type TaskWithSnakeCase = Task & {
  assigned_to?: string | null;
  due_date?: string | null;
  time_estimate?: number | null;
};

const PRIORITY_FLAG_COLORS: Record<number, string> = {
  1: "#ef4444",
  2: "#f97316",
  3: "#3b82f6",
  4: "#6b7280",
};

interface ProjectSectionBoardProps {
  sections: Section[];
  unassignedTasks: Task[];
  visibleTasks: Task[];
  database: Database;
  projectId: string;
  currentUserId?: string;
  bulkSelectMode: boolean;
  selectedTaskIds: Set<string>;
  loadingTaskIds: Set<string>;
  animatingOutTaskIds: Set<string>;
  optimisticCompletedIds: Set<string>;
  sectionTasksBySectionId: Map<string, Task[]>;
  childSectionsByParentId: Map<string, Section[]>;
  autoSectioning: boolean;
  onTaskFocus: (taskId: string) => void;
  onTaskToggle: (taskId: string) => void;
  onTaskEdit: (task: Task) => void;
  onTaskDelete: (taskId: string) => void;
  onTaskSelect: (taskId: string, event?: React.MouseEvent) => void;
  onSectionEdit: (section: Section) => void;
  onSectionDelete: (sectionId: string) => void;
  onAddTask: (projectId: string, sectionId?: string) => void;
  onAddSection: (parentId?: string, order?: number) => void;
  onTaskDropToSection: (taskId: string, sectionId: string) => void;
  onTaskDropToUnassigned: (taskId: string) => void;
  onAutoOrganizeUnassigned: () => void;
}

function formatTaskDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return format(date, "MMM d");
}

function formatEstimate(task: TaskWithSnakeCase): string | null {
  const rawEstimate = task.time_estimate ?? task.timeEstimate;
  const estimate = Number(rawEstimate);
  if (!Number.isFinite(estimate) || estimate <= 0) return null;

  const hours = Math.floor(estimate / 60);
  const minutes = estimate % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

function getTaskTags(task: Task, database: Database) {
  const tagsById = new Map(database.tags.map((tag) => [tag.id, tag] as const));
  const tags = new Map<string, { id: string; name: string; color: string }>();

  (task.tags || []).forEach((tagId) => {
    const tag = tagsById.get(tagId);
    if (tag) tags.set(tag.id, tag);
  });
  (task.tagBadges || []).forEach((tag) => tags.set(tag.id, tag));

  return Array.from(tags.values());
}

function BoardTaskCard({
  task,
  database,
  currentUserId,
  bulkSelectMode,
  selectedTaskIds,
  loadingTaskIds,
  animatingOutTaskIds,
  optimisticCompletedIds,
  blockedTaskIds,
  onTaskFocus,
  onTaskToggle,
  onTaskEdit,
  onTaskDelete,
  onTaskSelect,
}: {
  task: Task;
  database: Database;
  currentUserId?: string;
  bulkSelectMode: boolean;
  selectedTaskIds: Set<string>;
  loadingTaskIds: Set<string>;
  animatingOutTaskIds: Set<string>;
  optimisticCompletedIds: Set<string>;
  blockedTaskIds: Set<string>;
  onTaskFocus: (taskId: string) => void;
  onTaskToggle: (taskId: string) => void;
  onTaskEdit: (task: Task) => void;
  onTaskDelete: (taskId: string) => void;
  onTaskSelect: (taskId: string, event?: React.MouseEvent) => void;
}) {
  const typedTask = task as TaskWithSnakeCase;
  const isBlocked = blockedTaskIds.has(task.id);
  const isCompleted = task.completed || optimisticCompletedIds.has(task.id);
  const isLoading = loadingTaskIds.has(task.id);
  const isAnimatingOut = animatingOutTaskIds.has(task.id);
  const dueDateLabel = formatTaskDate(typedTask.due_date ?? task.dueDate);
  const deadlineLabel = formatTaskDate(task.deadline);
  const estimateLabel = formatEstimate(typedTask);
  const tags = getTaskTags(task, database);
  const description = richTextToPlainText(task.description).trim();
  const assignedToCurrentUser =
    currentUserId && (typedTask.assigned_to || task.assignedTo) === currentUserId;

  return (
    <div
      data-task-row="true"
      data-task-id={task.id}
      draggable={!isLoading && !isAnimatingOut}
      onMouseDown={() => onTaskFocus(task.id)}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("taskId", task.id);
      }}
      className={`task-list-row group rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 transition-colors hover:border-zinc-700 hover:bg-zinc-900 ${
        isCompleted ? "opacity-60" : ""
      } ${isAnimatingOut ? "animate-slide-fade-out" : ""}`}
    >
      <div className="flex min-w-0 items-start gap-3">
        {bulkSelectMode ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onTaskSelect(task.id, event);
            }}
            className="mt-0.5 shrink-0 text-zinc-400 transition-colors hover:text-[rgb(var(--theme-primary-rgb))]"
            aria-label={
              selectedTaskIds.has(task.id) ? "Deselect task" : "Select task"
            }
          >
            {selectedTaskIds.has(task.id) ? (
              <CheckSquare className="h-4 w-4 text-[rgb(var(--theme-primary-rgb))]" />
            ) : (
              <Square className="h-4 w-4" />
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (!isBlocked) onTaskToggle(task.id);
            }}
            disabled={isBlocked || isLoading}
            className="mt-0.5 shrink-0 text-zinc-400 transition-colors hover:text-white disabled:cursor-not-allowed disabled:text-zinc-600"
            title={isBlocked ? "Complete dependencies first" : "Toggle task"}
            aria-label={isCompleted ? "Mark incomplete" : "Mark complete"}
          >
            {isCompleted ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : isBlocked ? (
              <AlertCircle className="h-5 w-5" />
            ) : (
              <Circle
                className="h-5 w-5"
                style={{ color: PRIORITY_FLAG_COLORS[task.priority] }}
              />
            )}
          </button>
        )}

        <button
          type="button"
          onClick={() => onTaskEdit(task)}
          className="min-w-0 flex-1 text-left"
        >
          <div
            className={`whitespace-normal break-words text-sm font-medium leading-5 ${
              isCompleted ? "line-through text-zinc-500" : "text-zinc-100"
            }`}
          >
            {task.name}
          </div>
          {description ? (
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">
              {description}
            </p>
          ) : null}
        </button>

        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onTaskEdit(task);
            }}
            className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
            title="Edit task"
            aria-label="Edit task"
          >
            <Edit className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onTaskDelete(task.id);
            }}
            className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-300"
            title="Delete task"
            aria-label="Delete task"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-400">
        {dueDateLabel ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-0.5">
            <Calendar className="h-3 w-3" />
            {dueDateLabel}
          </span>
        ) : null}
        {deadlineLabel ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-red-200">
            <Flag className="h-3 w-3" />
            {deadlineLabel}
          </span>
        ) : null}
        {estimateLabel ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 text-teal-200">
            <Clock className="h-3 w-3" />
            {estimateLabel}
          </span>
        ) : null}
        {!isCompleted ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-0.5">
            <Flag
              className="h-3 w-3"
              style={{ color: PRIORITY_FLAG_COLORS[task.priority] }}
            />
            P{task.priority}
          </span>
        ) : null}
        {task.assignedToName && !assignedToCurrentUser ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-1.5 py-0.5">
            <UserAvatar
              name={task.assignedToName}
              profileColor={(task as any).assignedToColor}
              memoji={(task as any).assignedToMemoji}
              size={14}
              className="text-[8px]"
            />
            <span className="max-w-[110px] truncate">{task.assignedToName}</span>
          </span>
        ) : null}
        {tags.slice(0, 2).map((tag) => (
          <span
            key={tag.id}
            className="inline-flex max-w-[130px] items-center truncate rounded-md border px-2 py-0.5 uppercase tracking-wide"
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
        {tags.length > 2 ? (
          <span className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-0.5">
            +{tags.length - 2}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function SectionColumn({
  section,
  tasks,
  childSections,
  sectionTasksBySectionId,
  visibleTaskIds,
  database,
  currentUserId,
  bulkSelectMode,
  selectedTaskIds,
  loadingTaskIds,
  animatingOutTaskIds,
  optimisticCompletedIds,
  blockedTaskIds,
  dragOverSectionId,
  onDragOverSection,
  onDragLeaveSection,
  onDropToSection,
  onTaskFocus,
  onTaskToggle,
  onTaskEdit,
  onTaskDelete,
  onTaskSelect,
  onSectionEdit,
  onSectionDelete,
  onAddTask,
  onAddSection,
}: {
  section: Section;
  tasks: Task[];
  childSections: Section[];
  sectionTasksBySectionId: Map<string, Task[]>;
  visibleTaskIds: Set<string>;
  database: Database;
  currentUserId?: string;
  bulkSelectMode: boolean;
  selectedTaskIds: Set<string>;
  loadingTaskIds: Set<string>;
  animatingOutTaskIds: Set<string>;
  optimisticCompletedIds: Set<string>;
  blockedTaskIds: Set<string>;
  dragOverSectionId: string | null;
  onDragOverSection: (sectionId: string) => void;
  onDragLeaveSection: () => void;
  onDropToSection: (taskId: string, sectionId: string) => void;
  onTaskFocus: (taskId: string) => void;
  onTaskToggle: (taskId: string) => void;
  onTaskEdit: (task: Task) => void;
  onTaskDelete: (taskId: string) => void;
  onTaskSelect: (taskId: string, event?: React.MouseEvent) => void;
  onSectionEdit: (section: Section) => void;
  onSectionDelete: (sectionId: string) => void;
  onAddTask: (projectId: string, sectionId?: string) => void;
  onAddSection: (parentId?: string, order?: number) => void;
}) {
  const getVisibleSectionTasks = (sectionId: string) =>
    (sectionTasksBySectionId.get(sectionId) || []).filter((task) =>
      visibleTaskIds.has(task.id),
    );
  const visibleChildSections = childSections.filter(
    (childSection) => getVisibleSectionTasks(childSection.id).length > 0,
  );
  const sectionTaskCount =
    tasks.length +
    visibleChildSections.reduce(
      (total, childSection) =>
        total + getVisibleSectionTasks(childSection.id).length,
      0,
    );

  return (
    <section
      className={`flex max-h-[calc(100vh-285px)] min-h-[360px] flex-col rounded-lg border bg-zinc-950/60 transition-colors ${
        dragOverSectionId === section.id
          ? "border-[rgb(var(--theme-primary-rgb))] bg-[rgb(var(--theme-primary-rgb))]/10"
          : "border-zinc-800"
      }`}
      onDragOver={(event) => {
        event.preventDefault();
        onDragOverSection(section.id);
      }}
      onDragLeave={onDragLeaveSection}
      onDrop={(event) => {
        event.preventDefault();
        onDragLeaveSection();
        const taskId = event.dataTransfer.getData("taskId");
        if (taskId) onDropToSection(taskId, section.id);
      }}
    >
      <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-3 py-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            {section.icon ? (
              <span className="shrink-0 text-base leading-none">{section.icon}</span>
            ) : null}
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: section.color || "#71717a" }}
            />
            <h3 className="truncate text-sm font-semibold text-zinc-100">
              {section.name}
            </h3>
            <span className="shrink-0 text-xs text-zinc-500">
              ({sectionTaskCount})
            </span>
          </div>
          {section.description ? (
            <p className="mt-1 line-clamp-2 text-xs text-zinc-500">
              {section.description}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onAddTask(section.projectId, section.id)}
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
            title="Add task"
            aria-label="Add task"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onSectionEdit(section)}
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
            title="Edit section"
            aria-label="Edit section"
          >
            <Edit className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onSectionDelete(section.id)}
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-red-300"
            title="Delete section"
            aria-label="Delete section"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="space-y-2">
          {tasks.map((task) => (
            <BoardTaskCard
              key={task.id}
              task={task}
              database={database}
              currentUserId={currentUserId}
              bulkSelectMode={bulkSelectMode}
              selectedTaskIds={selectedTaskIds}
              loadingTaskIds={loadingTaskIds}
              animatingOutTaskIds={animatingOutTaskIds}
              optimisticCompletedIds={optimisticCompletedIds}
              blockedTaskIds={blockedTaskIds}
              onTaskFocus={onTaskFocus}
              onTaskToggle={onTaskToggle}
              onTaskEdit={onTaskEdit}
              onTaskDelete={onTaskDelete}
              onTaskSelect={onTaskSelect}
            />
          ))}

          {visibleChildSections.map((childSection) => {
            const childTasks = getVisibleSectionTasks(childSection.id);

            return (
              <div key={childSection.id} className="pt-2">
                <div className="mb-2 flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: childSection.color || "#71717a" }}
                  />
                  {childSection.name}
                </div>
                <div className="space-y-2">
                  {childTasks.map((task) => (
                    <BoardTaskCard
                      key={task.id}
                      task={task}
                      database={database}
                      currentUserId={currentUserId}
                      bulkSelectMode={bulkSelectMode}
                      selectedTaskIds={selectedTaskIds}
                      loadingTaskIds={loadingTaskIds}
                      animatingOutTaskIds={animatingOutTaskIds}
                      optimisticCompletedIds={optimisticCompletedIds}
                      blockedTaskIds={blockedTaskIds}
                      onTaskFocus={onTaskFocus}
                      onTaskToggle={onTaskToggle}
                      onTaskEdit={onTaskEdit}
                      onTaskDelete={onTaskDelete}
                      onTaskSelect={onTaskSelect}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {tasks.length === 0 && visibleChildSections.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-800 px-3 py-8 text-center text-sm text-zinc-500">
              Drop tasks here.
            </div>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onAddSection(section.id)}
        className="mx-3 mb-3 rounded-lg border border-dashed border-zinc-800 px-3 py-2 text-sm text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-300"
      >
        Add Sub-section
      </button>
    </section>
  );
}

export function ProjectSectionBoard({
  sections,
  unassignedTasks,
  visibleTasks,
  database,
  projectId,
  currentUserId,
  bulkSelectMode,
  selectedTaskIds,
  loadingTaskIds,
  animatingOutTaskIds,
  optimisticCompletedIds,
  sectionTasksBySectionId,
  childSectionsByParentId,
  autoSectioning,
  onTaskFocus,
  onTaskToggle,
  onTaskEdit,
  onTaskDelete,
  onTaskSelect,
  onSectionEdit,
  onSectionDelete,
  onAddTask,
  onAddSection,
  onTaskDropToSection,
  onTaskDropToUnassigned,
  onAutoOrganizeUnassigned,
}: ProjectSectionBoardProps) {
  const [dragOverSectionId, setDragOverSectionId] = useState<string | null>(null);
  const [unassignedDragOver, setUnassignedDragOver] = useState(false);
  const blockedTaskIds = useMemo(
    () => getBlockedTaskIds(database.tasks),
    [database.tasks],
  );
  const taskIdsInVisibleSet = useMemo(
    () => new Set(visibleTasks.map((task) => task.id)),
    [visibleTasks],
  );

  const handleUnassignedDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setUnassignedDragOver(false);

    const taskId = event.dataTransfer.getData("taskId");
    if (taskId) {
      onTaskDropToUnassigned(taskId);
    }
  };

  return (
    <div className="w-full overflow-x-auto overscroll-x-contain pb-4">
      <div className="grid min-w-full grid-flow-col auto-cols-[minmax(340px,1fr)] gap-4 lg:auto-cols-[minmax(390px,1fr)]">
        {sections.map((section) => {
          const sectionTasks = (sectionTasksBySectionId.get(section.id) || [])
            .filter((task) => taskIdsInVisibleSet.has(task.id));
          const childSections = childSectionsByParentId.get(section.id) || [];

          return (
            <SectionColumn
              key={section.id}
              section={section}
              tasks={sectionTasks}
              childSections={childSections}
              sectionTasksBySectionId={sectionTasksBySectionId}
              visibleTaskIds={taskIdsInVisibleSet}
              database={database}
              currentUserId={currentUserId}
              bulkSelectMode={bulkSelectMode}
              selectedTaskIds={selectedTaskIds}
              loadingTaskIds={loadingTaskIds}
              animatingOutTaskIds={animatingOutTaskIds}
              optimisticCompletedIds={optimisticCompletedIds}
              blockedTaskIds={blockedTaskIds}
              dragOverSectionId={dragOverSectionId}
              onDragOverSection={setDragOverSectionId}
              onDragLeaveSection={() => setDragOverSectionId(null)}
              onDropToSection={onTaskDropToSection}
              onTaskFocus={onTaskFocus}
              onTaskToggle={onTaskToggle}
              onTaskEdit={onTaskEdit}
              onTaskDelete={onTaskDelete}
              onTaskSelect={onTaskSelect}
              onSectionEdit={onSectionEdit}
              onSectionDelete={onSectionDelete}
              onAddTask={onAddTask}
              onAddSection={onAddSection}
            />
          );
        })}

        <section
          className={`flex max-h-[calc(100vh-285px)] min-h-[360px] flex-col rounded-lg border bg-zinc-950/60 transition-colors ${
            unassignedDragOver
              ? "border-[rgb(var(--theme-primary-rgb))] bg-[rgb(var(--theme-primary-rgb))]/10"
              : "border-zinc-800"
          }`}
          onDragOver={(event) => {
            event.preventDefault();
            setUnassignedDragOver(true);
          }}
          onDragLeave={() => setUnassignedDragOver(false)}
          onDrop={handleUnassignedDrop}
        >
          <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-3 py-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-zinc-100">
                Unassigned
              </h3>
              <p className="text-xs text-zinc-500">
                {unassignedTasks.length} task
                {unassignedTasks.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onAddTask(projectId)}
                className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
                title="Add unassigned task"
                aria-label="Add unassigned task"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onAutoOrganizeUnassigned}
                disabled={autoSectioning || unassignedTasks.length === 0}
                className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                title="AI organize unassigned tasks"
                aria-label="AI organize unassigned tasks"
              >
                <Bot
                  className={`h-3.5 w-3.5 ${autoSectioning ? "animate-pulse" : ""}`}
                />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            <div className="space-y-2">
              {unassignedTasks.map((task) => (
                <BoardTaskCard
                  key={task.id}
                  task={task}
                  database={database}
                  currentUserId={currentUserId}
                  bulkSelectMode={bulkSelectMode}
                  selectedTaskIds={selectedTaskIds}
                  loadingTaskIds={loadingTaskIds}
                  animatingOutTaskIds={animatingOutTaskIds}
                  optimisticCompletedIds={optimisticCompletedIds}
                  blockedTaskIds={blockedTaskIds}
                  onTaskFocus={onTaskFocus}
                  onTaskToggle={onTaskToggle}
                  onTaskEdit={onTaskEdit}
                  onTaskDelete={onTaskDelete}
                  onTaskSelect={onTaskSelect}
                />
              ))}

              {unassignedTasks.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-800 px-3 py-8 text-center text-sm text-zinc-500">
                  Drop tasks here to remove them from a section.
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <button
          type="button"
          onClick={() => onAddSection(undefined, sections.length)}
          className="flex min-h-[180px] items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-700 bg-zinc-950/30 p-4 text-sm font-medium text-zinc-400 transition-colors hover:border-zinc-600 hover:bg-zinc-950/70 hover:text-white"
        >
          <Plus className="h-4 w-4" />
          Add Section
        </button>
      </div>
    </div>
  );
}
