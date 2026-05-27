import type { SupabaseClient } from "@supabase/supabase-js";
import { richTextToPlainText } from "@/lib/rich-text";
import {
  listInboxItemsForUser,
  applyThreadAction,
  listRulesForUser,
  createRule,
} from "@/lib/email-inbox/server";

/**
 * Tool layer for the in-app AI agent.
 *
 * Every executor receives an admin Supabase client plus the acting user's id
 * and the set of project ids that user is allowed to touch (resolved once per
 * request). Authorization is enforced here, not by the model: the model can
 * only ask for an action, and these executors refuse anything outside the
 * caller's accessible projects.
 */

export type AgentToolContext = {
  admin: SupabaseClient;
  userId: string;
  /** Project ids the user can read/write, resolved from org membership. */
  accessibleProjectIds: Set<string>;
};

export type AgentToolResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
};

/** Resolve the project ids a user may operate on, via org membership. */
export async function resolveAccessibleProjectIds(
  admin: SupabaseClient,
  userId: string,
): Promise<Set<string>> {
  const { data: memberships } = await admin
    .from("user_organizations")
    .select("organization_id")
    .eq("user_id", userId);

  const orgIds = (memberships || [])
    .map((m: any) => m.organization_id)
    .filter((id: any): id is string => typeof id === "string" && id.length > 0);

  if (orgIds.length === 0) return new Set();

  const { data: projects } = await admin
    .from("projects")
    .select("id")
    .in("organization_id", orgIds);

  return new Set(
    (projects || [])
      .map((p: any) => p.id)
      .filter((id: any): id is string => typeof id === "string"),
  );
}

const TASK_SELECT =
  "id, name, description, priority, due_date, due_time, deadline, completed, completed_at, project_id, section_id, parent_id, created_at, updated_at";

function shapeTask(row: any) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ? richTextToPlainText(row.description).slice(0, 600) : null,
    priority: row.priority ?? null,
    dueDate: row.due_date ?? null,
    dueTime: row.due_time ?? null,
    deadline: row.deadline ?? null,
    completed: Boolean(row.completed),
    projectId: row.project_id ?? null,
    sectionId: row.section_id ?? null,
    parentId: row.parent_id ?? null,
  };
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Verify a task exists and belongs to a project the user can access. */
async function loadAuthorizedTask(ctx: AgentToolContext, taskId: string) {
  const { data, error } = await ctx.admin
    .from("tasks")
    .select(TASK_SELECT)
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  if (!data.project_id || !ctx.accessibleProjectIds.has(data.project_id)) return null;
  return data;
}

// ---- Tool schemas (OpenAI function-calling format) ----

export const AGENT_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "list_tasks",
      description:
        "Search and list the user's tasks. Use this to answer questions about what tasks exist, including 'what tasks do you see on this page' (pass the current projectId from page context). Returns incomplete tasks by default.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          projectId: {
            type: "string",
            description: "Restrict to a single project. Use the page context projectId for page-specific questions.",
          },
          includeCompleted: { type: "boolean", description: "Include completed tasks. Default false." },
          dueFilter: {
            type: "string",
            enum: ["all", "overdue", "today", "upcoming", "no_date"],
            description: "Filter by due date relative to today. Default all.",
          },
          search: { type: "string", description: "Case-insensitive substring match on the task name." },
          limit: { type: "integer", description: "Max results, 1-100. Default 50." },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_task",
      description: "Fetch full detail for a single task by id.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { taskId: { type: "string" } },
        required: ["taskId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_task",
      description:
        "Create a new task. Requires a projectId (use the current page's projectId unless the user names another project). Confirm details with the user first if ambiguous.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          projectId: { type: "string" },
          description: { type: "string" },
          priority: { type: "integer", enum: [1, 2, 3, 4], description: "1=highest, 4=lowest (default)." },
          dueDate: { type: "string", description: "ISO date YYYY-MM-DD." },
          dueTime: { type: "string", description: "HH:MM 24h." },
          deadline: { type: "string", description: "ISO date YYYY-MM-DD hard deadline." },
          sectionId: { type: "string", description: "Optional section/list id within the project." },
          parentId: { type: "string", description: "Optional parent task id to create this as a subtask." },
        },
        required: ["name", "projectId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_task",
      description: "Update fields on an existing task. Only the provided fields change. Pass null to clear a date field.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          taskId: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          priority: { type: "integer", enum: [1, 2, 3, 4] },
          dueDate: { type: ["string", "null"], description: "YYYY-MM-DD or null to clear." },
          dueTime: { type: ["string", "null"] },
          deadline: { type: ["string", "null"] },
          sectionId: { type: ["string", "null"] },
        },
        required: ["taskId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "complete_task",
      description: "Mark a task complete (or reopen it).",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          taskId: { type: "string" },
          completed: { type: "boolean", description: "true to complete (default), false to reopen." },
        },
        required: ["taskId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_task",
      description:
        "Permanently delete a task. Destructive: only call after the user has clearly confirmed they want it deleted.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { taskId: { type: "string" } },
        required: ["taskId"],
      },
    },
  },
  // ---- Daily prioritization ----
  {
    type: "function" as const,
    function: {
      name: "get_daily_capacity",
      description:
        "Get today's date, the user's daily working capacity in minutes, and the total estimated minutes of tasks already due today. Use this to judge what is realistically achievable today.",
      parameters: { type: "object", additionalProperties: false, properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_today_candidates",
      description:
        "List incomplete tasks that are overdue, due today, or due within the next 7 days, across all the user's projects. Each includes its time estimate (minutes, if set), priority, due date, and project. Use this to decide priorities for today.",
      parameters: { type: "object", additionalProperties: false, properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_task_to_today",
      description:
        "Surface a task in the Today view by setting its due date to today. Use after deciding which tasks the user should focus on today.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { taskId: { type: "string" } },
        required: ["taskId"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "set_task_estimate",
      description: "Set a task's time estimate in minutes, so daily capacity planning is accurate.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { taskId: { type: "string" }, minutes: { type: "integer" } },
        required: ["taskId", "minutes"],
      },
    },
  },
  // ---- Inbox triage ----
  {
    type: "function" as const,
    function: {
      name: "list_inbox",
      description:
        "List email inbox items (threads). Returns id (threadId), subject, sender, classification (actionable/newsletter/spam/waiting/reference/unknown), status, and a short summary. Use to answer 'any new tasks from my inbox?' or to find spam to clean up.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          status: {
            type: "string",
            enum: ["active", "quarantine", "needs_project", "archived", "spam", "resolved"],
            description: "Filter by thread status. Omit for active items.",
          },
          limit: { type: "integer", description: "Max items, 1-50. Default 30." },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "inbox_action",
      description:
        "Act on an inbox thread. Actions: archive, spam, delete (destructive — confirm first), snooze (needs snoozeUntil), to_task (convert the email into task(s)), mark_read. For deleting spam, confirm with the user unless they already told you to delete it.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          threadId: { type: "string" },
          action: {
            type: "string",
            enum: ["archive", "spam", "delete", "snooze", "to_task", "mark_read"],
          },
          snoozeUntil: { type: "string", description: "ISO timestamp, required for snooze." },
          projectId: { type: "string", description: "Optional target project for to_task." },
        },
        required: ["threadId", "action"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_inbox_rules",
      description: "List the user's persistent email rules (the rules that auto-process future inbox items).",
      parameters: { type: "object", additionalProperties: false, properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_inbox_rule",
      description:
        "Create a persistent email rule so future matching emails are handled automatically. Stored in the database across sessions. Conditions match on sender_email/sender_domain/subject/body/mailbox/participant; actions auto-apply (e.g. spam, archive, mark_read, generate_tasks).",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          matchMode: { type: "string", enum: ["all", "any"], description: "Default all." },
          conditions: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                field: {
                  type: "string",
                  enum: ["sender_email", "sender_domain", "subject", "body", "mailbox", "participant"],
                },
                operator: { type: "string", enum: ["contains", "equals", "ends_with", "starts_with"] },
                value: { type: "string" },
              },
              required: ["field", "operator", "value"],
            },
          },
          actions: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                type: {
                  type: "string",
                  enum: ["quarantine", "always_delete", "mark_read", "archive", "spam", "never_spam", "generate_tasks"],
                },
              },
              required: ["type"],
            },
          },
        },
        required: ["name", "conditions", "actions"],
      },
    },
  },
];

/** Raw tool definitions (name/description/parameters), used to build
 *  provider-specific tool shapes (OpenAI-compatible vs Anthropic). */
export const AGENT_TOOL_DEFS = AGENT_TOOLS.map((t) => t.function);

// ---- Executors ----

export async function executeTool(
  ctx: AgentToolContext,
  name: string,
  args: Record<string, any>,
): Promise<AgentToolResult> {
  try {
    switch (name) {
      case "list_tasks":
        return await listTasks(ctx, args);
      case "get_task":
        return await getTask(ctx, args);
      case "create_task":
        return await createTask(ctx, args);
      case "update_task":
        return await updateTask(ctx, args);
      case "complete_task":
        return await completeTask(ctx, args);
      case "delete_task":
        return await deleteTask(ctx, args);
      case "get_daily_capacity":
        return await getDailyCapacity(ctx);
      case "list_today_candidates":
        return await listTodayCandidates(ctx);
      case "add_task_to_today":
        return await addTaskToToday(ctx, args);
      case "set_task_estimate":
        return await setTaskEstimate(ctx, args);
      case "list_inbox":
        return await listInbox(ctx, args);
      case "inbox_action":
        return await inboxAction(ctx, args);
      case "list_inbox_rules":
        return await listInboxRules(ctx);
      case "create_inbox_rule":
        return await createInboxRule(ctx, args);
      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Tool execution failed" };
  }
}

async function listTasks(ctx: AgentToolContext, args: Record<string, any>): Promise<AgentToolResult> {
  if (ctx.accessibleProjectIds.size === 0) {
    return { ok: true, data: { tasks: [], note: "No accessible projects." } };
  }

  const limit = Math.min(100, Math.max(1, Number(args.limit) || 50));
  let query = ctx.admin.from("tasks").select(TASK_SELECT);

  if (typeof args.projectId === "string" && args.projectId) {
    if (!ctx.accessibleProjectIds.has(args.projectId)) {
      return { ok: false, error: "Project not accessible." };
    }
    query = query.eq("project_id", args.projectId);
  } else {
    query = query.in("project_id", Array.from(ctx.accessibleProjectIds));
  }

  if (!args.includeCompleted) query = query.eq("completed", false);
  if (typeof args.search === "string" && args.search.trim()) {
    query = query.ilike("name", `%${args.search.trim()}%`);
  }

  const today = todayStr();
  switch (args.dueFilter) {
    case "overdue":
      query = query.lt("due_date", today).not("due_date", "is", null);
      break;
    case "today":
      query = query.eq("due_date", today);
      break;
    case "upcoming":
      query = query.gte("due_date", today);
      break;
    case "no_date":
      query = query.is("due_date", null);
      break;
    default:
      break;
  }

  const { data, error } = await query.order("due_date", { ascending: true }).limit(limit);
  if (error) return { ok: false, error: error.message };

  return { ok: true, data: { count: (data || []).length, tasks: (data || []).map(shapeTask) } };
}

async function getTask(ctx: AgentToolContext, args: Record<string, any>): Promise<AgentToolResult> {
  const task = await loadAuthorizedTask(ctx, String(args.taskId));
  if (!task) return { ok: false, error: "Task not found or not accessible." };
  return { ok: true, data: shapeTask(task) };
}

async function createTask(ctx: AgentToolContext, args: Record<string, any>): Promise<AgentToolResult> {
  const projectId = String(args.projectId || "");
  if (!projectId || !ctx.accessibleProjectIds.has(projectId)) {
    return { ok: false, error: "A valid, accessible projectId is required." };
  }
  if (!args.name || !String(args.name).trim()) {
    return { ok: false, error: "Task name is required." };
  }

  const insert: Record<string, any> = {
    name: String(args.name).trim(),
    project_id: projectId,
    completed: false,
    priority: [1, 2, 3, 4].includes(args.priority) ? args.priority : 4,
  };
  if (typeof args.description === "string") insert.description = args.description;
  if (typeof args.dueDate === "string") insert.due_date = args.dueDate;
  if (typeof args.dueTime === "string") insert.due_time = args.dueTime;
  if (typeof args.deadline === "string") insert.deadline = args.deadline;
  if (typeof args.sectionId === "string") insert.section_id = args.sectionId;
  if (typeof args.parentId === "string") {
    const parent = await loadAuthorizedTask(ctx, args.parentId);
    if (!parent) return { ok: false, error: "Parent task not found or not accessible." };
    insert.parent_id = args.parentId;
  }

  const { data, error } = await ctx.admin.from("tasks").insert(insert).select(TASK_SELECT).single();
  if (error) return { ok: false, error: error.message };

  if (insert.section_id) {
    await ctx.admin
      .from("task_sections")
      .upsert({ task_id: data.id, section_id: insert.section_id }, { onConflict: "task_id,section_id" });
  }

  return { ok: true, data: shapeTask(data) };
}

async function updateTask(ctx: AgentToolContext, args: Record<string, any>): Promise<AgentToolResult> {
  const task = await loadAuthorizedTask(ctx, String(args.taskId));
  if (!task) return { ok: false, error: "Task not found or not accessible." };

  const update: Record<string, any> = { updated_at: new Date().toISOString() };
  if (typeof args.name === "string" && args.name.trim()) update.name = args.name.trim();
  if (typeof args.description === "string") update.description = args.description;
  if ([1, 2, 3, 4].includes(args.priority)) update.priority = args.priority;
  if ("dueDate" in args) update.due_date = args.dueDate === null ? null : String(args.dueDate);
  if ("dueTime" in args) update.due_time = args.dueTime === null ? null : String(args.dueTime);
  if ("deadline" in args) update.deadline = args.deadline === null ? null : String(args.deadline);
  if ("sectionId" in args) update.section_id = args.sectionId === null ? null : String(args.sectionId);

  const { data, error } = await ctx.admin
    .from("tasks")
    .update(update)
    .eq("id", task.id)
    .select(TASK_SELECT)
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: shapeTask(data) };
}

async function completeTask(ctx: AgentToolContext, args: Record<string, any>): Promise<AgentToolResult> {
  const task = await loadAuthorizedTask(ctx, String(args.taskId));
  if (!task) return { ok: false, error: "Task not found or not accessible." };
  const completed = args.completed !== false;

  const { data, error } = await ctx.admin
    .from("tasks")
    .update({
      completed,
      completed_at: completed ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", task.id)
    .select(TASK_SELECT)
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: shapeTask(data) };
}

async function deleteTask(ctx: AgentToolContext, args: Record<string, any>): Promise<AgentToolResult> {
  const task = await loadAuthorizedTask(ctx, String(args.taskId));
  if (!task) return { ok: false, error: "Task not found or not accessible." };

  const { error } = await ctx.admin.from("tasks").delete().eq("id", task.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { deletedId: task.id, name: task.name } };
}

// ---- Daily prioritization executors ----

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function getDailyCapacity(ctx: AgentToolContext): Promise<AgentToolResult> {
  const today = todayStr();
  const { data: profile } = await ctx.admin
    .from("profiles")
    .select("daily_capacity_minutes")
    .eq("id", ctx.userId)
    .maybeSingle();

  const capacityMinutes = Number((profile as any)?.daily_capacity_minutes) || 300;

  let dueTodayMinutes = 0;
  if (ctx.accessibleProjectIds.size > 0) {
    const { data } = await ctx.admin
      .from("tasks")
      .select("time_estimate")
      .in("project_id", Array.from(ctx.accessibleProjectIds))
      .eq("completed", false)
      .eq("due_date", today);
    dueTodayMinutes = (data || []).reduce(
      (sum: number, t: any) => sum + (Number(t.time_estimate) || 0),
      0,
    );
  }

  return { ok: true, data: { date: today, capacityMinutes, dueTodayEstimatedMinutes: dueTodayMinutes } };
}

async function listTodayCandidates(ctx: AgentToolContext): Promise<AgentToolResult> {
  if (ctx.accessibleProjectIds.size === 0) return { ok: true, data: { candidates: [] } };
  const today = todayStr();
  const horizon = addDays(today, 7);

  const { data, error } = await ctx.admin
    .from("tasks")
    .select("id, name, priority, due_date, deadline, time_estimate, project_id")
    .in("project_id", Array.from(ctx.accessibleProjectIds))
    .eq("completed", false)
    .not("due_date", "is", null)
    .lte("due_date", horizon)
    .order("due_date", { ascending: true })
    .limit(80);
  if (error) return { ok: false, error: error.message };

  const projectIds = Array.from(new Set((data || []).map((t: any) => t.project_id).filter(Boolean)));
  const projectNames = new Map<string, string>();
  if (projectIds.length) {
    const { data: projects } = await ctx.admin.from("projects").select("id, name").in("id", projectIds);
    for (const p of projects || []) projectNames.set(p.id, p.name);
  }

  const candidates = (data || []).map((t: any) => ({
    id: t.id,
    name: t.name,
    priority: t.priority ?? 4,
    dueDate: t.due_date,
    deadline: t.deadline ?? null,
    estimateMinutes: typeof t.time_estimate === "number" ? t.time_estimate : null,
    projectName: t.project_id ? projectNames.get(t.project_id) || null : null,
    isOverdue: t.due_date < today,
    isToday: t.due_date === today,
  }));

  return { ok: true, data: { today, candidates } };
}

async function addTaskToToday(ctx: AgentToolContext, args: Record<string, any>): Promise<AgentToolResult> {
  const task = await loadAuthorizedTask(ctx, String(args.taskId));
  if (!task) return { ok: false, error: "Task not found or not accessible." };
  const { data, error } = await ctx.admin
    .from("tasks")
    .update({ due_date: todayStr(), updated_at: new Date().toISOString() })
    .eq("id", task.id)
    .select(TASK_SELECT)
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: shapeTask(data) };
}

async function setTaskEstimate(ctx: AgentToolContext, args: Record<string, any>): Promise<AgentToolResult> {
  const task = await loadAuthorizedTask(ctx, String(args.taskId));
  if (!task) return { ok: false, error: "Task not found or not accessible." };
  const minutes = Math.max(0, Math.round(Number(args.minutes)));
  if (!Number.isFinite(minutes)) return { ok: false, error: "minutes must be a number." };
  const { error } = await ctx.admin
    .from("tasks")
    .update({ time_estimate: minutes, updated_at: new Date().toISOString() })
    .eq("id", task.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { taskId: task.id, estimateMinutes: minutes } };
}

// ---- Inbox triage executors ----

async function listInbox(ctx: AgentToolContext, args: Record<string, any>): Promise<AgentToolResult> {
  const limit = Math.min(50, Math.max(1, Number(args.limit) || 30));
  const items = await listInboxItemsForUser(
    ctx.userId,
    typeof args.status === "string" ? { status: args.status } : { status: "active" },
  );
  const shaped = items.slice(0, limit).map((item: any) => {
    const from = (item.participants || []).find((p: any) => p.participantRole === "from");
    return {
      threadId: item.id,
      subject: item.subject,
      sender: from ? from.emailAddress : null,
      classification: item.classification,
      status: item.status,
      actionTitle: item.actionTitle,
      summary: item.summaryText || item.previewText || null,
      derivedTaskCount: item.derivedTaskCount,
    };
  });
  return { ok: true, data: { count: shaped.length, items: shaped } };
}

async function inboxAction(ctx: AgentToolContext, args: Record<string, any>): Promise<AgentToolResult> {
  const threadId = String(args.threadId || "");
  const action = String(args.action || "");
  if (!threadId || !action) return { ok: false, error: "threadId and action are required." };

  try {
    const result = await applyThreadAction({
      userId: ctx.userId,
      threadId,
      action: action as any,
      snoozedUntil: typeof args.snoozeUntil === "string" ? args.snoozeUntil : null,
      projectId: typeof args.projectId === "string" ? args.projectId : null,
    });
    return { ok: true, data: { threadId, action, result } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Inbox action failed" };
  }
}

async function listInboxRules(ctx: AgentToolContext): Promise<AgentToolResult> {
  const rules = await listRulesForUser(ctx.userId);
  const shaped = (rules || []).map((r: any) => ({
    id: r.id,
    name: r.name,
    isActive: r.isActive,
    matchMode: r.matchMode,
    conditions: r.conditions,
    actions: r.actions,
  }));
  return { ok: true, data: { count: shaped.length, rules: shaped } };
}

async function createInboxRule(ctx: AgentToolContext, args: Record<string, any>): Promise<AgentToolResult> {
  if (!args.name || !Array.isArray(args.conditions) || !Array.isArray(args.actions)) {
    return { ok: false, error: "name, conditions[], and actions[] are required." };
  }
  if (args.conditions.length === 0 || args.actions.length === 0) {
    return { ok: false, error: "Provide at least one condition and one action." };
  }
  try {
    const rule = await createRule(ctx.userId, {
      name: String(args.name),
      description: typeof args.description === "string" ? args.description : null,
      source: "ai_training",
      matchMode: args.matchMode === "any" ? "any" : "all",
      conditions: args.conditions,
      actions: args.actions,
    });
    return { ok: true, data: { id: rule.id, name: rule.name } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to create rule" };
  }
}
