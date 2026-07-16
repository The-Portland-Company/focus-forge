"use client";

import { useState, useEffect, useMemo } from "react";
import {
  ChevronRight,
  ChevronDown,
  Edit,
  Trash2,
  Plus,
  GripVertical,
  Target,
} from "lucide-react";
import { Section, Task, Database, Goal } from "@/lib/types";
import { TaskList } from "./task-list";
import { GoalGroupShell } from "./goal-group";

interface SectionViewProps {
  section: Section;
  tasks: Task[];
  allTasks: Task[];
  database: Database;
  level?: number;
  priorityColor?: string;
  currentUserId?: string;
  completedAccordionKey?: string;
  revealActionsOnHover?: boolean;
  dueDateLayout?: "inline" | "below" | "right";
  bulkSelectMode?: boolean;
  selectedTaskIds?: Set<string>;
  loadingTaskIds?: Set<string>;
  animatingOutTaskIds?: Set<string>;
  optimisticCompletedIds?: Set<string>;
  sectionTasksBySectionId?: Map<string, Task[]>;
  childSectionsByParentId?: Map<string, Section[]>;
  goalsBySectionId?: Map<string | null, Goal[]>;
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
  onSectionEdit: (section: Section) => void;
  onSectionDelete: (sectionId: string) => void;
  onAddTask: (section: Section) => void;
  onAddSection: (parentId: string) => void;
  onAddSectionAfter?: (section: Section) => void;
  onTaskDrop: (taskId: string, sectionId: string) => void;
  onSectionReorder: (sectionId: string, newOrder: number) => void;
  onAddGoal?: (projectId: string, sectionId?: string) => void;
  onCompleteGoal?: (goalId: string, completed: boolean) => void;
  onRenameGoal?: (goalId: string, name: string) => void;
  onDeleteGoal?: (goalId: string) => void;
  onTaskDropToGoal?: (
    taskId: string,
    goalId: string,
    sectionId?: string,
  ) => void;
  onSectionDropToGoal?: (sectionId: string, goalId: string) => void;
  onAddTaskToGoal?: (goalId: string) => void;
  onAddSectionToGoal?: (goalId: string) => void;
  onAddSubGoal?: (goalId: string) => void;
  userId: string;
}

export function SectionView({
  section,
  tasks,
  allTasks,
  database,
  level = 0,
  priorityColor,
  currentUserId,
  completedAccordionKey,
  revealActionsOnHover = false,
  dueDateLayout = "inline",
  bulkSelectMode = false,
  selectedTaskIds,
  loadingTaskIds,
  animatingOutTaskIds,
  optimisticCompletedIds,
  sectionTasksBySectionId,
  childSectionsByParentId,
  goalsBySectionId,
  enableDueDateQuickEdit = false,
  onTaskFocus,
  onTaskUpdate,
  onTaskToggle,
  onTaskEdit,
  onTaskDelete,
  onTaskSelect,
  onSectionEdit,
  onSectionDelete,
  onAddTask,
  onAddSection,
  onAddSectionAfter,
  onTaskDrop,
  onSectionReorder,
  onAddGoal,
  onCompleteGoal,
  onRenameGoal,
  onDeleteGoal,
  onTaskDropToGoal,
  onSectionDropToGoal,
  onAddTaskToGoal,
  onAddSectionToGoal,
  onAddSubGoal,
  userId,
}: SectionViewProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [isDraggingSelf, setIsDraggingSelf] = useState(false);

  // Load collapsed state from user preferences
  useEffect(() => {
    const preference = database.userSectionPreferences?.find(
      (pref) => pref.userId === userId && pref.sectionId === section.id,
    );
    if (preference) {
      setIsCollapsed(preference.isCollapsed);
    }
  }, [database.userSectionPreferences, userId, section.id]);

  // Get tasks for this section
  const sectionTasks = useMemo(() => {
    const indexedTasks = sectionTasksBySectionId?.get(section.id);
    if (indexedTasks) return indexedTasks;

    return tasks.filter((task) => {
      const taskSections =
        database.taskSections?.filter((ts) => ts.taskId === task.id) || [];
      return (
        taskSections.some((ts) => ts.sectionId === section.id) ||
        task.sectionId === section.id ||
        (task as any).section_id === section.id
      );
    });
  }, [database.taskSections, section.id, sectionTasksBySectionId, tasks]);

  // Get child sections
  const childSections = useMemo(() => {
    const indexedChildren = childSectionsByParentId?.get(section.id);
    if (indexedChildren) return indexedChildren;

    return (
      database.sections
        ?.filter((s) => s.parentId === section.id)
        .sort((a, b) => (a.order || 0) - (b.order || 0)) || []
    );
  }, [childSectionsByParentId, database.sections, section.id]);

  // Goals attached to this section (null-section goals are handled by the
  // caller in the unsectioned area).
  const goalsForSection = useMemo(
    () =>
      (goalsBySectionId?.get(section.id) || []).filter(
        // Sub-goals render nested inside their parent goal, not here.
        (g) => !(g.parentGoalId || (g as any).parent_goal_id),
      ),
    [goalsBySectionId, section.id],
  );

  const getTaskGoalId = (task: Task): string | null =>
    (task.goalId || (task as any).goal_id || null) as string | null;

  // When goals exist, split them out of the flat list; otherwise every task
  // renders in the single ungrouped list (unchanged behavior).
  const goalLessTasks = useMemo(
    () =>
      goalsForSection.length > 0
        ? sectionTasks.filter((task) => !getTaskGoalId(task))
        : sectionTasks,
    [goalsForSection.length, sectionTasks],
  );

  const renderTaskList = (listTasks: Task[], keySuffix: string) => (
    <TaskList
      tasks={listTasks}
      allTasks={allTasks}
      projects={database.projects}
      tags={database.tags}
      currentUserId={currentUserId}
      priorityColor={priorityColor}
      showCompleted={database.settings?.showCompletedTasks ?? true}
      completedAccordionKey={
        completedAccordionKey
          ? `${completedAccordionKey}-section-${section.id}-${keySuffix}`
          : undefined
      }
      revealActionsOnHover={revealActionsOnHover}
      dueDateLayout={dueDateLayout}
      uniformDueBadgeWidth={dueDateLayout === "inline"}
      bulkSelectMode={bulkSelectMode}
      selectedTaskIds={selectedTaskIds}
      loadingTaskIds={loadingTaskIds}
      animatingOutTaskIds={animatingOutTaskIds}
      optimisticCompletedIds={optimisticCompletedIds}
      enableDueDateQuickEdit={enableDueDateQuickEdit}
      onTaskFocus={onTaskFocus}
      onTaskUpdate={onTaskUpdate}
      onTaskToggle={onTaskToggle}
      onTaskEdit={onTaskEdit}
      onTaskDelete={onTaskDelete}
      onTaskSelect={onTaskSelect}
    />
  );

  // Recursively render a goal and everything nested inside it: its tasks, its
  // owned task lists (sections with goal_id), and its sub-goals.
  const renderGoalNode = (goal: Goal): React.ReactNode => {
    const goalTasks = sectionTasks.filter(
      (task) => getTaskGoalId(task) === goal.id,
    );
    const completedCount = goalTasks.filter(
      (task) => task.completed || optimisticCompletedIds?.has(task.id),
    ).length;
    const goalOwnedSections = (database.sections || []).filter(
      (s) =>
        (s.goalId || (s as any).goal_id) === goal.id &&
        !(s as any).is_deleted &&
        !(s as any).isDeleted,
    );
    const subGoals = (database.goals || []).filter(
      (g) =>
        (g.parentGoalId || (g as any).parent_goal_id) === goal.id &&
        !(g as any).deleted_at,
    );
    const hasContent =
      goalTasks.length > 0 ||
      goalOwnedSections.length > 0 ||
      subGoals.length > 0;

    return (
      <div key={goal.id} className="mb-4">
        <GoalGroupShell
          goal={goal}
          completedCount={completedCount}
          totalCount={goalTasks.length}
          sectionId={section.id}
          onTaskDropToGoal={onTaskDropToGoal}
          onSectionDropToGoal={onSectionDropToGoal}
          onCompleteGoal={onCompleteGoal}
          onRenameGoal={onRenameGoal}
          onDeleteGoal={onDeleteGoal}
          onAddTaskToGoal={onAddTaskToGoal}
          onAddSectionToGoal={onAddSectionToGoal}
          onAddSubGoal={onAddSubGoal}
        >
          {goalTasks.length > 0 && renderTaskList(goalTasks, `goal-${goal.id}`)}
          {goalOwnedSections.map((ownedSection) => (
            <SectionView
              key={ownedSection.id}
              section={ownedSection}
              tasks={tasks}
              allTasks={allTasks}
              database={database}
              level={level + 1}
              priorityColor={priorityColor}
              currentUserId={currentUserId}
              completedAccordionKey={completedAccordionKey}
              revealActionsOnHover={revealActionsOnHover}
              dueDateLayout={dueDateLayout}
              bulkSelectMode={bulkSelectMode}
              selectedTaskIds={selectedTaskIds}
              loadingTaskIds={loadingTaskIds}
              animatingOutTaskIds={animatingOutTaskIds}
              optimisticCompletedIds={optimisticCompletedIds}
              sectionTasksBySectionId={sectionTasksBySectionId}
              childSectionsByParentId={childSectionsByParentId}
              goalsBySectionId={goalsBySectionId}
              enableDueDateQuickEdit={enableDueDateQuickEdit}
              onTaskFocus={onTaskFocus}
              onTaskUpdate={onTaskUpdate}
              onTaskToggle={onTaskToggle}
              onTaskEdit={onTaskEdit}
              onTaskDelete={onTaskDelete}
              onTaskSelect={onTaskSelect}
              onSectionEdit={onSectionEdit}
              onSectionDelete={onSectionDelete}
              onAddTask={onAddTask}
              onAddSection={onAddSection}
              onAddSectionAfter={onAddSectionAfter}
              onTaskDrop={onTaskDrop}
              onSectionReorder={onSectionReorder}
              onAddGoal={onAddGoal}
              onCompleteGoal={onCompleteGoal}
              onRenameGoal={onRenameGoal}
              onDeleteGoal={onDeleteGoal}
              onTaskDropToGoal={onTaskDropToGoal}
              onSectionDropToGoal={onSectionDropToGoal}
              onAddTaskToGoal={onAddTaskToGoal}
              onAddSectionToGoal={onAddSectionToGoal}
              onAddSubGoal={onAddSubGoal}
              userId={userId}
            />
          ))}
          {subGoals.map((subGoal) => renderGoalNode(subGoal))}
          {!hasContent && (
            <div className="rounded-lg border border-dashed border-zinc-800 px-3 py-3 text-center text-xs text-zinc-600">
              Drop tasks or a task list here.
            </div>
          )}
        </GoalGroupShell>
      </div>
    );
  };

  const handleToggleCollapse = async () => {
    const newCollapsed = !isCollapsed;
    setIsCollapsed(newCollapsed);

    // Save preference
    try {
      await fetch("/api/user-section-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          sectionId: section.id,
          isCollapsed: newCollapsed,
        }),
      });
    } catch (error) {
      console.error("Failed to save section preference:", error);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    const taskId = e.dataTransfer.getData("taskId");
    if (taskId) {
      onTaskDrop(taskId, section.id);
    }
  };

  return (
    <div
      className={`section-visibility-auto ${level > 0 ? "ml-6" : ""} group/section`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Section Header */}
      <div
        draggable
        onDragStart={(e) => {
          e.stopPropagation();
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("sectionId", section.id);
          // Ghost = the section header itself (natural drag preview).
          const header = e.currentTarget as HTMLElement;
          e.dataTransfer.setDragImage(header, 16, 16);
          setIsDraggingSelf(true);
        }}
        onDragEnd={() => setIsDraggingSelf(false)}
        className={`flex items-center gap-2 p-2 rounded-lg hover:bg-zinc-800/50 group transition-all cursor-pointer ${
          isDraggingSelf ? "opacity-50" : ""
        } ${
          dragOver ? "bg-zinc-800/50 ring-2 ring-[var(--theme-primary)]" : ""
        }`}
        onClick={handleToggleCollapse}
      >
        <button className="p-1">
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4 text-zinc-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-400" />
          )}
        </button>

        <div className="flex items-center gap-2 flex-1">
          <span className="text-lg">{section.icon}</span>
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: section.color }}
          />
          <span className="font-medium text-white">{section.name}</span>
          <span className="text-sm text-zinc-500">({sectionTasks.length})</span>
        </div>

        <div className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 flex items-center gap-1 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddTask(section);
            }}
            className="p-1 hover:bg-zinc-700 rounded transition-colors"
            title="Add task"
          >
            <Plus className="w-4 h-4" />
          </button>
          {onAddGoal && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddGoal(section.projectId, section.id);
              }}
              className="p-1 hover:bg-zinc-700 rounded transition-colors"
              title="Add goal"
            >
              <Target className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSectionEdit(section);
            }}
            className="p-1 hover:bg-zinc-700 rounded transition-colors"
            title="Edit section"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSectionDelete(section.id);
            }}
            className="p-1 hover:bg-zinc-700 rounded transition-colors text-red-400"
            title="Delete section"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <GripVertical className="w-4 h-4 text-zinc-500 cursor-move" />
        </div>
      </div>

      {/* Section Content */}
      {!isCollapsed && (
        <div className="ml-6 mt-2">
          {/* Section Description */}
          {section.description && (
            <p className="text-sm text-zinc-400 mb-3 ml-6">
              {section.description}
            </p>
          )}

          {/* Goal-less tasks in this section (or all tasks when no goals). */}
          {goalLessTasks.length > 0 && (
            <div className="mb-4">{renderTaskList(goalLessTasks, "root")}</div>
          )}

          {/* Goal sub-groups (each renders its tasks, nested task lists, and
              sub-goals recursively). */}
          {goalsForSection.map((goal) => renderGoalNode(goal))}

          <div className="mb-2 flex h-0 w-full items-center justify-center overflow-visible">
            <div className="pointer-events-auto flex items-center gap-2 rounded-lg opacity-0 transition-all duration-200 translate-y-2 group-hover/section:translate-y-0 group-hover/section:opacity-100">
              {onAddSectionAfter && (
                <button
                  onClick={() => onAddSectionAfter(section)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-500 transition-colors group-hover/section:bg-zinc-900/50 group-hover/section:text-zinc-300"
                  type="button"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  <span className="whitespace-nowrap">Add Section</span>
                </button>
              )}
              <button
                onClick={() => onAddTask(section)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-500 transition-colors group-hover/section:bg-zinc-900/50 group-hover/section:text-zinc-300"
                type="button"
              >
                <Plus className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">Add Task</span>
              </button>
            </div>
          </div>

          {/* Child sections */}
          {childSections.map((childSection) => (
            <SectionView
              key={childSection.id}
              section={childSection}
              tasks={tasks}
              allTasks={allTasks}
              database={database}
              level={level + 1}
              priorityColor={priorityColor}
              currentUserId={currentUserId}
              completedAccordionKey={completedAccordionKey}
              revealActionsOnHover={revealActionsOnHover}
              dueDateLayout={dueDateLayout}
              bulkSelectMode={bulkSelectMode}
              selectedTaskIds={selectedTaskIds}
              loadingTaskIds={loadingTaskIds}
              animatingOutTaskIds={animatingOutTaskIds}
              optimisticCompletedIds={optimisticCompletedIds}
              sectionTasksBySectionId={sectionTasksBySectionId}
              childSectionsByParentId={childSectionsByParentId}
              goalsBySectionId={goalsBySectionId}
              enableDueDateQuickEdit={enableDueDateQuickEdit}
              onTaskFocus={onTaskFocus}
              onTaskUpdate={onTaskUpdate}
              onTaskToggle={onTaskToggle}
              onTaskEdit={onTaskEdit}
              onTaskDelete={onTaskDelete}
              onTaskSelect={onTaskSelect}
              onSectionEdit={onSectionEdit}
              onSectionDelete={onSectionDelete}
              onAddTask={onAddTask}
              onAddSection={onAddSection}
              onAddSectionAfter={onAddSectionAfter}
              onTaskDrop={onTaskDrop}
              onSectionReorder={onSectionReorder}
              onAddGoal={onAddGoal}
              onCompleteGoal={onCompleteGoal}
              onRenameGoal={onRenameGoal}
              onDeleteGoal={onDeleteGoal}
              onTaskDropToGoal={onTaskDropToGoal}
              onSectionDropToGoal={onSectionDropToGoal}
              onAddTaskToGoal={onAddTaskToGoal}
              onAddSectionToGoal={onAddSectionToGoal}
              onAddSubGoal={onAddSubGoal}
              userId={userId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
