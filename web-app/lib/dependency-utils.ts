import { Task } from "./types";

/**
 * Check if a task is blocked by uncompleted dependencies
 */
export function isTaskBlocked(task: Task, allTasks: Task[]): boolean {
  if (!task.dependsOn || task.dependsOn.length === 0) return false;

  return task.dependsOn.some((depId) => {
    const depTask = allTasks.find((t) => t.id === depId);
    return depTask && !depTask.completed;
  });
}

/**
 * Get all tasks that are blocking the given task
 */
export function getBlockingTasks(task: Task, allTasks: Task[]): Task[] {
  if (!task.dependsOn || task.dependsOn.length === 0) return [];

  return task.dependsOn
    .map((depId) => allTasks.find((t) => t.id === depId))
    .filter((t) => t && !t.completed) as Task[];
}

/**
 * Check if adding a dependency would create a circular dependency
 */
export function hasCircularDependency(
  taskId: string,
  newDependencyId: string,
  allTasks: Task[],
): boolean {
  // Can't depend on itself
  if (taskId === newDependencyId) return true;

  const visited = new Set<string>();

  const checkDependencies = (currentId: string): boolean => {
    if (currentId === taskId) return true;
    if (visited.has(currentId)) return false;

    visited.add(currentId);
    const task = allTasks.find((t) => t.id === currentId);
    if (!task?.dependsOn) return false;

    return task.dependsOn.some((depId) => checkDependencies(depId));
  };

  return checkDependencies(newDependencyId);
}

/**
 * Get all tasks that depend on the given task (direct and indirect)
 */
export function getDependentTasks(taskId: string, allTasks: Task[]): Task[] {
  const dependents = new Set<string>();

  const findDependents = (id: string) => {
    allTasks.forEach((task) => {
      if (task.dependsOn?.includes(id) && !dependents.has(task.id)) {
        dependents.add(task.id);
        findDependents(task.id); // Recursively find tasks that depend on this one
      }
    });
  };

  findDependents(taskId);
  return Array.from(dependents)
    .map((id) => allTasks.find((t) => t.id === id)!)
    .filter(Boolean);
}

/**
 * Check if a task can be selected as a dependency for another task
 */
export function canBeSelectedAsDependency(
  taskId: string,
  potentialDependencyId: string,
  allTasks: Task[],
): { canSelect: boolean; reason?: string } {
  if (taskId === potentialDependencyId) {
    return { canSelect: false, reason: "A task cannot depend on itself" };
  }

  const task = allTasks.find((t) => t.id === taskId);
  const potentialDep = allTasks.find((t) => t.id === potentialDependencyId);

  if (!potentialDep) {
    return { canSelect: false, reason: "Task not found" };
  }

  // Check if it's already a dependency
  if (task?.dependsOn?.includes(potentialDependencyId)) {
    return { canSelect: false, reason: "Already a dependency" };
  }

  // Check if it would create a circular dependency
  if (hasCircularDependency(taskId, potentialDependencyId, allTasks)) {
    return { canSelect: false, reason: "Would create a circular dependency" };
  }

  // Check if potential dependency is a subtask of the current task
  if (potentialDep.parentId === taskId) {
    return { canSelect: false, reason: "Cannot depend on own subtask" };
  }

  return { canSelect: true };
}

/**
 * Filter tasks based on blocked status
 */
export function filterTasksByBlockedStatus(
  tasks: Task[],
  allTasks: Task[],
  showBlocked: boolean,
): Task[] {
  if (showBlocked) return tasks;

  return tasks.filter((task) => !isTaskBlocked(task, allTasks));
}
