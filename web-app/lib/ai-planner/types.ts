export type PlannerMode = "clarify" | "draft_plan" | "finalize_tasks";

export type PlanDraft = {
  title: string;
  overview: string;
  objectives: string[];
  scope: {
    in: string[];
    out: string[];
  };
  architecture: string[];
  milestones: Array<{
    name: string;
    outcome: string;
    acceptanceCriteria: string[];
  }>;
  risks: Array<{
    risk: string;
    mitigation: string;
  }>;
};

export type TaskBlueprintSubtask = {
  name: string;
  description?: string;
};

export type TaskBlueprintTask = {
  name: string;
  description?: string;
  priority?: 1 | 2 | 3 | 4;
  dependencies?: string[];
  estimate?: string;
  subtasks?: TaskBlueprintSubtask[];
};

export type TaskBlueprintList = {
  name: string;
  description?: string;
  tasks: TaskBlueprintTask[];
};

export type TaskBlueprint = {
  summary?: string;
  lists: TaskBlueprintList[];
};

export type PlannerModelOutput = {
  assistantMessage: string;
  readiness: "needs_clarification" | "draft_ready" | "ready_for_execution";
  missingInfo: string[];
  planDraft?: PlanDraft;
  taskBlueprint?: TaskBlueprint;
};

export function isValidTaskBlueprint(value: any): value is TaskBlueprint {
  if (!value || typeof value !== "object") return false;
  if (!Array.isArray(value.lists) || value.lists.length === 0) return false;

  return value.lists.every((list: any) => {
    if (!list || typeof list !== "object") return false;
    if (typeof list.name !== "string" || !list.name.trim()) return false;
    if (!Array.isArray(list.tasks) || list.tasks.length === 0) return false;

    return list.tasks.every((task: any) => {
      if (!task || typeof task !== "object") return false;
      if (typeof task.name !== "string" || !task.name.trim()) return false;
      if (task.priority !== undefined && ![1, 2, 3, 4].includes(task.priority)) {
        return false;
      }
      if (task.subtasks !== undefined) {
        if (!Array.isArray(task.subtasks)) return false;
        if (
          task.subtasks.some(
            (sub: any) => !sub || typeof sub.name !== "string" || !sub.name.trim(),
          )
        ) {
          return false;
        }
      }
      return true;
    });
  });
}
