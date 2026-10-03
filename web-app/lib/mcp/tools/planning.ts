// MCP tool definitions for planning (P5.G1) -- list/create/update/delete
// goals, tasks and subtasks, set status/estimate, log time. These write
// through the same tables (and the same createServiceSupabase client) the
// app's own mobile API routes use, so the Specs-sync outbox triggers on
// goals/tasks/sections (supabase/migrations/20261003220000_specs_forge_connectors.sql)
// cover MCP-originated writes "for free" at the table level, same as UI and
// mobile writes.
import {
  createServiceSupabase,
  getMobileAdapterForUser,
} from "@/lib/mobile/api";
import type { McpTool, McpToolResult } from "@/lib/mcp/server/types";

export type { McpTool };

const toResult = (value: unknown): McpToolResult => ({
  content: [{ type: "text", text: JSON.stringify(value ?? null) }],
  structuredContent: value,
});

const errorResult = (message: string): McpToolResult => ({
  content: [{ type: "text", text: JSON.stringify({ error: message }) }],
  isError: true,
});

async function assertProjectAccess(userId: string, projectId: string) {
  const adapter = await getMobileAdapterForUser(userId);
  const projects = await adapter.getProjects();
  const hasAccess = projects.some((project: any) => project.id === projectId);
  if (!hasAccess) {
    throw new Error("project_not_found_or_not_accessible");
  }
}

async function projectIdForGoal(goalId: string): Promise<string | null> {
  const supabase = createServiceSupabase();
  const { data } = await supabase
    .from("goals")
    .select("project_id")
    .eq("id", goalId)
    .maybeSingle();
  return data?.project_id ?? null;
}

async function projectIdForTask(taskId: string): Promise<string | null> {
  const supabase = createServiceSupabase();
  const { data } = await supabase
    .from("tasks")
    .select("project_id")
    .eq("id", taskId)
    .maybeSingle();
  return data?.project_id ?? null;
}

export const PLANNING_MCP_TOOLS: McpTool[] = [
  {
    name: "list_tree",
    title: "List project tree",
    description:
      "List a project's full tree: sections, goals (with sub-goals) and tasks (with sub-tasks).",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The project id." },
      },
      required: ["projectId"],
      additionalProperties: false,
    },
    requiredScopes: ["read"],
    handler: async (args, ctx) => {
      const projectId = String(args?.projectId ?? "");
      if (!projectId) return errorResult("projectId is required");
      try {
        await assertProjectAccess(ctx.userId, projectId);
      } catch {
        return errorResult("project_not_found_or_not_accessible");
      }

      const supabase = createServiceSupabase();
      const [{ data: sections }, { data: goals }, { data: tasks }] = await Promise.all([
        supabase
          .from("sections")
          .select("id,name,order_index,goal_id")
          .eq("project_id", projectId)
          .is("deleted_at", null)
          .order("order_index", { ascending: true }),
        supabase
          .from("goals")
          .select("id,name,description,section_id,parent_goal_id,completed,order_index")
          .eq("project_id", projectId)
          .is("deleted_at", null)
          .order("order_index", { ascending: true }),
        supabase
          .from("tasks")
          .select(
            "id,name,description,goal_id,parent_id,section_id,completed,status,priority,time_estimate,due_date",
          )
          .eq("project_id", projectId)
          .is("deleted_at", null)
          .order("order_index", { ascending: true }),
      ]);

      return toResult({
        projectId,
        sections: sections ?? [],
        goals: goals ?? [],
        tasks: tasks ?? [],
      });
    },
  },
  {
    name: "get_project",
    title: "Get project",
    description: "Get a single project's details by id.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The project id." },
      },
      required: ["projectId"],
      additionalProperties: false,
    },
    requiredScopes: ["read"],
    handler: async (args, ctx) => {
      const projectId = String(args?.projectId ?? "");
      if (!projectId) return errorResult("projectId is required");
      const adapter = await getMobileAdapterForUser(ctx.userId);
      const projects = await adapter.getProjects();
      const project = projects.find((p: any) => p.id === projectId);
      if (!project) return errorResult("project_not_found_or_not_accessible");
      return toResult(project);
    },
  },
  {
    name: "create_goal",
    title: "Create goal",
    description: "Create a goal (optionally a sub-goal) in a project.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        sectionId: { type: "string" },
        parentGoalId: { type: "string", description: "Set to create a sub-goal." },
      },
      required: ["projectId", "name"],
      additionalProperties: false,
    },
    requiredScopes: ["write"],
    handler: async (args, ctx) => {
      const projectId = String(args?.projectId ?? "");
      const name = String(args?.name ?? "").trim();
      if (!projectId || !name) return errorResult("projectId and name are required");
      try {
        await assertProjectAccess(ctx.userId, projectId);
      } catch {
        return errorResult("project_not_found_or_not_accessible");
      }

      const supabase = createServiceSupabase();
      const { data, error } = await supabase
        .from("goals")
        .insert({
          project_id: projectId,
          name,
          description: typeof args?.description === "string" ? args.description : null,
          section_id: typeof args?.sectionId === "string" ? args.sectionId : null,
          parent_goal_id: typeof args?.parentGoalId === "string" ? args.parentGoalId : null,
        })
        .select()
        .single();

      if (error) return errorResult(error.message);
      return toResult(data);
    },
  },
  {
    name: "update_goal",
    title: "Update goal",
    description: "Update a goal's name, description, section or parent goal.",
    inputSchema: {
      type: "object",
      properties: {
        goalId: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        sectionId: { type: "string" },
        parentGoalId: { type: "string" },
        completed: { type: "boolean" },
      },
      required: ["goalId"],
      additionalProperties: false,
    },
    requiredScopes: ["write"],
    handler: async (args, ctx) => {
      const goalId = String(args?.goalId ?? "");
      if (!goalId) return errorResult("goalId is required");
      const projectId = await projectIdForGoal(goalId);
      if (!projectId) return errorResult("goal_not_found");
      try {
        await assertProjectAccess(ctx.userId, projectId);
      } catch {
        return errorResult("project_not_found_or_not_accessible");
      }

      const updates: Record<string, unknown> = {}
      if (typeof args?.name === "string") updates.name = args.name
      if (typeof args?.description === "string") updates.description = args.description
      if (typeof args?.sectionId === "string") updates.section_id = args.sectionId
      if (typeof args?.parentGoalId === "string") updates.parent_goal_id = args.parentGoalId
      if (typeof args?.completed === "boolean") {
        updates.completed = args.completed
        updates.completed_at = args.completed ? new Date().toISOString() : null
      }
      if (Object.keys(updates).length === 0) return errorResult("no_fields_to_update");

      const supabase = createServiceSupabase();
      const { data, error } = await supabase
        .from("goals")
        .update(updates)
        .eq("id", goalId)
        .select()
        .single();

      if (error) return errorResult(error.message);
      return toResult(data);
    },
  },
  {
    name: "delete_goal",
    title: "Delete goal",
    description: "Soft-delete a goal (its live tasks are orphaned back to the project).",
    inputSchema: {
      type: "object",
      properties: { goalId: { type: "string" } },
      required: ["goalId"],
      additionalProperties: false,
    },
    requiredScopes: ["write"],
    handler: async (args, ctx) => {
      const goalId = String(args?.goalId ?? "");
      if (!goalId) return errorResult("goalId is required");
      const projectId = await projectIdForGoal(goalId);
      if (!projectId) return errorResult("goal_not_found");
      try {
        await assertProjectAccess(ctx.userId, projectId);
      } catch {
        return errorResult("project_not_found_or_not_accessible");
      }
      const adapter = await getMobileAdapterForUser(ctx.userId);
      const result = await adapter.deleteGoal(goalId);
      return toResult(result);
    },
  },
  {
    name: "create_task",
    title: "Create task",
    description: "Create a task or sub-task (set parentTaskId for a sub-task).",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        goalId: { type: "string" },
        sectionId: { type: "string" },
        parentTaskId: { type: "string", description: "Set to create a sub-task." },
        dueDate: { type: "string" },
        priority: { type: "number" },
      },
      required: ["projectId", "name"],
      additionalProperties: false,
    },
    requiredScopes: ["write"],
    handler: async (args, ctx) => {
      const projectId = String(args?.projectId ?? "");
      const name = String(args?.name ?? "").trim();
      if (!projectId || !name) return errorResult("projectId and name are required");
      try {
        await assertProjectAccess(ctx.userId, projectId);
      } catch {
        return errorResult("project_not_found_or_not_accessible");
      }

      const adapter = await getMobileAdapterForUser(ctx.userId);
      const task = await adapter.createTask({
        project_id: projectId,
        name,
        description: typeof args?.description === "string" ? args.description : undefined,
        goal_id: typeof args?.goalId === "string" ? args.goalId : undefined,
        section_id: typeof args?.sectionId === "string" ? args.sectionId : undefined,
        parent_id: typeof args?.parentTaskId === "string" ? args.parentTaskId : undefined,
        due_date: typeof args?.dueDate === "string" ? args.dueDate : undefined,
        priority: typeof args?.priority === "number" ? args.priority : undefined,
        created_by: ctx.userId,
      });
      return toResult(task);
    },
  },
  {
    name: "update_task",
    title: "Update task",
    description: "Update a task's fields.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        goalId: { type: "string" },
        sectionId: { type: "string" },
        parentTaskId: { type: "string" },
        dueDate: { type: "string" },
        priority: { type: "number" },
        completed: { type: "boolean" },
      },
      required: ["taskId"],
      additionalProperties: false,
    },
    requiredScopes: ["write"],
    handler: async (args, ctx) => {
      const taskId = String(args?.taskId ?? "");
      if (!taskId) return errorResult("taskId is required");
      const projectId = await projectIdForTask(taskId);
      if (!projectId) return errorResult("task_not_found");
      try {
        await assertProjectAccess(ctx.userId, projectId);
      } catch {
        return errorResult("project_not_found_or_not_accessible");
      }

      const updates: Record<string, unknown> = {}
      if (typeof args?.name === "string") updates.name = args.name
      if (typeof args?.description === "string") updates.description = args.description
      if (typeof args?.goalId === "string") updates.goal_id = args.goalId
      if (typeof args?.sectionId === "string") updates.section_id = args.sectionId
      if (typeof args?.parentTaskId === "string") updates.parent_id = args.parentTaskId
      if (typeof args?.dueDate === "string") updates.due_date = args.dueDate
      if (typeof args?.priority === "number") updates.priority = args.priority
      if (typeof args?.completed === "boolean") {
        updates.completed = args.completed
        updates.completed_at = args.completed ? new Date().toISOString() : null
      }
      if (Object.keys(updates).length === 0) return errorResult("no_fields_to_update");

      const adapter = await getMobileAdapterForUser(ctx.userId);
      const task = await adapter.updateTask(taskId, updates);
      return toResult(task);
    },
  },
  {
    name: "delete_task",
    title: "Delete task",
    description: "Soft-delete a task (and its sub-tasks).",
    inputSchema: {
      type: "object",
      properties: { taskId: { type: "string" } },
      required: ["taskId"],
      additionalProperties: false,
    },
    requiredScopes: ["write"],
    handler: async (args, ctx) => {
      const taskId = String(args?.taskId ?? "");
      if (!taskId) return errorResult("taskId is required");
      const projectId = await projectIdForTask(taskId);
      if (!projectId) return errorResult("task_not_found");
      try {
        await assertProjectAccess(ctx.userId, projectId);
      } catch {
        return errorResult("project_not_found_or_not_accessible");
      }
      const adapter = await getMobileAdapterForUser(ctx.userId);
      const result = await adapter.deleteTask(taskId);
      return toResult(result);
    },
  },
  {
    name: "set_status",
    title: "Set task status",
    description: "Set a task's completed/in-progress status.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        status: { type: "string", enum: ["todo", "in_progress", "done"] },
      },
      required: ["taskId", "status"],
      additionalProperties: false,
    },
    requiredScopes: ["write"],
    handler: async (args, ctx) => {
      const taskId = String(args?.taskId ?? "");
      const status = String(args?.status ?? "");
      if (!taskId || !["todo", "in_progress", "done"].includes(status)) {
        return errorResult("taskId and a valid status are required");
      }
      const projectId = await projectIdForTask(taskId);
      if (!projectId) return errorResult("task_not_found");
      try {
        await assertProjectAccess(ctx.userId, projectId);
      } catch {
        return errorResult("project_not_found_or_not_accessible");
      }

      const adapter = await getMobileAdapterForUser(ctx.userId);
      const task = await adapter.updateTask(taskId, {
        status,
        completed: status === "done",
        completed_at: status === "done" ? new Date().toISOString() : null,
      });
      return toResult(task);
    },
  },
  {
    name: "set_estimate",
    title: "Set task estimate",
    description: "Set a task's time estimate, in minutes.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        estimateMin: { type: "number" },
      },
      required: ["taskId", "estimateMin"],
      additionalProperties: false,
    },
    requiredScopes: ["write"],
    handler: async (args, ctx) => {
      const taskId = String(args?.taskId ?? "");
      const estimateMin = Number(args?.estimateMin);
      if (!taskId || !Number.isFinite(estimateMin)) {
        return errorResult("taskId and estimateMin are required");
      }
      const projectId = await projectIdForTask(taskId);
      if (!projectId) return errorResult("task_not_found");
      try {
        await assertProjectAccess(ctx.userId, projectId);
      } catch {
        return errorResult("project_not_found_or_not_accessible");
      }

      const adapter = await getMobileAdapterForUser(ctx.userId);
      const task = await adapter.updateTask(taskId, {
        estimate_min: estimateMin,
        time_estimate: estimateMin,
      });
      return toResult(task);
    },
  },
  {
    name: "log_time",
    title: "Log time",
    description: "Log a block of time spent on a task.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        startedAt: { type: "string", description: "ISO8601 start time." },
        endedAt: { type: "string", description: "ISO8601 end time." },
        description: { type: "string" },
      },
      required: ["taskId", "startedAt", "endedAt"],
      additionalProperties: false,
    },
    requiredScopes: ["write"],
    handler: async (args, ctx) => {
      const taskId = String(args?.taskId ?? "");
      const startedAt = String(args?.startedAt ?? "");
      const endedAt = String(args?.endedAt ?? "");
      if (!taskId || !startedAt || !endedAt) {
        return errorResult("taskId, startedAt and endedAt are required");
      }

      const supabase = createServiceSupabase();
      const { data: task } = await supabase
        .from("tasks")
        .select("id,project_id")
        .eq("id", taskId)
        .maybeSingle();
      if (!task?.project_id) return errorResult("task_not_found");

      try {
        await assertProjectAccess(ctx.userId, task.project_id);
      } catch {
        return errorResult("project_not_found_or_not_accessible");
      }

      const { data: project } = await supabase
        .from("projects")
        .select("organization_id")
        .eq("id", task.project_id)
        .maybeSingle();

      const { data, error } = await supabase.rpc("time_create_entry", {
        p_user_id: ctx.userId,
        p_organization_id: project?.organization_id ?? "",
        p_project_id: task.project_id,
        p_task_ids: [taskId],
        p_started_at: startedAt,
        p_ended_at: endedAt,
        p_description: typeof args?.description === "string" ? args.description : undefined,
        p_source: "mcp",
      });

      if (error) return errorResult(error.message);
      return toResult(data);
    },
  },
];
