import type { SupabaseClient } from "@supabase/supabase-js";
import { richTextToPlainText } from "@/lib/rich-text";
import {
  listInboxItemsForUser,
  applyThreadAction,
  listRulesForUser,
  createRule,
} from "@/lib/email-inbox/server";
import { writeAuditLog } from "@/lib/audit/log";
import {
  evaluateConfirmGate,
  type DestructiveAction,
} from "@/lib/ai-agent/confirm-gate";
import { selectTodayTasks } from "@/lib/daily-plan/today-selection";

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
  /**
   * IANA timezone of the acting user's browser (e.g. "America/Los_Angeles").
   * The Today view computes "today" in the browser's local timezone; the API
   * host is typically UTC, so without this the agent's date-based filters drift
   * a calendar day and miss tasks the user can plainly see. Optional; falls
   * back to the server's local date when absent.
   */
  timezone?: string | null;
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

/**
 * Today's calendar date as YYYY-MM-DD. When a valid IANA timezone is supplied
 * (the acting user's browser tz), the date is computed in that zone so the
 * agent agrees with the client-rendered Today view. Falls back to the server's
 * local date if tz is absent or invalid.
 */
function todayStr(tz?: string | null): string {
  if (tz) {
    try {
      // en-CA yields YYYY-MM-DD; the timeZone option does the zone shift.
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
    } catch {
      // Invalid timezone identifier — fall through to server-local date.
    }
  }
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
  {
    type: "function" as const,
    function: {
      name: "list_projects",
      description:
        "List the user's accessible projects (id + name). Use this to resolve which project a task belongs to when the user names a project, or when there is no project on the current page and you need to pick/confirm one before creating a task.",
      parameters: { type: "object", additionalProperties: false, properties: {} },
    },
  },
  // ---- Organizations & projects (read / write / destructive) ----
  {
    type: "function" as const,
    function: {
      name: "list_organizations",
      description:
        "List the organizations the user belongs to (id, name, color). Use to resolve an organizationId before creating a project, or to answer questions about the user's orgs.",
      parameters: { type: "object", additionalProperties: false, properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_organization",
      description: "Fetch a single accessible organization by id or name (id, name, color, project count).",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          name: { type: "string", description: "Case-insensitive exact/substring match if id is not provided." },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_project",
      description: "Fetch a single accessible project by id or name (id, name, color, archived, organizationId, task count).",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          name: { type: "string", description: "Case-insensitive exact/substring match if id is not provided." },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_organization",
      description: "Create a new organization owned by the user.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          color: { type: "string", description: "Optional hex color like #6B7280." },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_organization",
      description: "Rename or recolor an accessible organization.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          color: { type: "string" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_project",
      description:
        "Create a project inside an accessible organization. Resolve organizationId via list_organizations first if the user names an org.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          organizationId: { type: "string" },
          name: { type: "string" },
          color: { type: "string", description: "Optional hex color." },
        },
        required: ["organizationId", "name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_project",
      description: "Rename, recolor, or archive/unarchive an accessible project.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          color: { type: "string" },
          archived: { type: "boolean" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_project",
      description:
        "DESTRUCTIVE, cascades to the project's tasks & sections. DOUBLE-CONFIRM REQUIRED. Step 1: call with just id or name (NO confirm) to get the impact and a confirmToken — this does NOT delete. Present the exact target + impact to the user and ask for explicit confirmation. Step 2: only after the user clearly says yes, call again with confirm:true AND the confirmToken from step 1. Never pass confirm:true without the user's explicit go-ahead.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          name: { type: "string", description: "Used to resolve the target if id is not given." },
          confirm: { type: "boolean", description: "Set true ONLY on the second call after the user confirmed." },
          confirmToken: { type: "string", description: "The token returned by the first (unconfirmed) call." },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_organization",
      description:
        "DESTRUCTIVE, cascades to ALL the org's projects and their tasks. DOUBLE-CONFIRM REQUIRED. Step 1: call with just id or name (NO confirm) to get the impact and a confirmToken — this does NOT delete. Present the exact target + impact to the user and ask for explicit confirmation. Step 2: only after the user clearly says yes, call again with confirm:true AND the confirmToken from step 1. Never pass confirm:true without the user's explicit go-ahead.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          name: { type: "string", description: "Used to resolve the target if id is not given." },
          confirm: { type: "boolean", description: "Set true ONLY on the second call after the user confirmed." },
          confirmToken: { type: "string", description: "The token returned by the first (unconfirmed) call." },
        },
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
      name: "list_today_view",
      description:
        "Return the EXACT set of tasks and inbox items that appear in the user's Today view right now — overdue tasks, tasks due today, tasks due tomorrow, tasks due later this week, and actionable inbox items. Use this (NOT list_tasks with dueFilter=today) when the user asks 'what's in my Today view', 'what tasks do I have today', or any question about what they see on the Today screen.",
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
      case "list_projects":
        return await listProjects(ctx);
      case "list_organizations":
        return await listOrganizations(ctx);
      case "get_organization":
        return await getOrganization(ctx, args);
      case "get_project":
        return await getProject(ctx, args);
      case "create_organization":
        return await createOrganization(ctx, args);
      case "update_organization":
        return await updateOrganization(ctx, args);
      case "create_project":
        return await createProject(ctx, args);
      case "update_project":
        return await updateProject(ctx, args);
      case "delete_project":
        return await deleteProjectGated(ctx, args);
      case "delete_organization":
        return await deleteOrganizationGated(ctx, args);
      case "get_daily_capacity":
        return await getDailyCapacity(ctx);
      case "list_today_candidates":
        return await listTodayCandidates(ctx);
      case "list_today_view":
        return await listTodayView(ctx);
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

  const today = todayStr(ctx.timezone);
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

  // Soft-delete through the entity-versioning RPC (recoverable from /trash,
  // logs an entity_events batch, cascades to subtasks). A raw .delete() would
  // hard-delete and bypass the trash/versioning system. Access is already
  // verified by loadAuthorizedTask above.
  const { data: batchId, error } = await ctx.admin.rpc("soft_delete_entity", {
    p_entity_type: "task",
    p_entity_id: task.id,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { deletedId: task.id, name: task.name, batchId } };
}

async function listProjects(ctx: AgentToolContext): Promise<AgentToolResult> {
  if (ctx.accessibleProjectIds.size === 0) return { ok: true, data: { projects: [] } };
  const { data, error } = await ctx.admin
    .from("projects")
    .select("id, name")
    .in("id", Array.from(ctx.accessibleProjectIds))
    .order("name", { ascending: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { projects: (data || []).map((p: any) => ({ id: p.id, name: p.name })) } };
}

// ---- Organization & project executors (RLS-scoped via accessible ids) ----

/** Resolve the org ids the user belongs to (the org-level RLS boundary). */
async function resolveAccessibleOrgIds(ctx: AgentToolContext): Promise<Set<string>> {
  const { data } = await ctx.admin
    .from("user_organizations")
    .select("organization_id")
    .eq("user_id", ctx.userId);
  return new Set(
    (data || [])
      .map((m: any) => m.organization_id)
      .filter((id: any): id is string => typeof id === "string" && id.length > 0),
  );
}

async function listOrganizations(ctx: AgentToolContext): Promise<AgentToolResult> {
  const orgIds = await resolveAccessibleOrgIds(ctx);
  if (orgIds.size === 0) return { ok: true, data: { organizations: [] } };
  const { data, error } = await ctx.admin
    .from("organizations")
    .select("id, name, color")
    .in("id", Array.from(orgIds))
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    data: {
      organizations: (data || []).map((o: any) => ({ id: o.id, name: o.name, color: o.color ?? null })),
    },
  };
}

/** Resolve an org the user can access by id or (case-insensitive) name.
 *  Returns the row, or a list of candidates when a name is ambiguous. */
async function resolveOrg(
  ctx: AgentToolContext,
  args: Record<string, any>,
): Promise<{ org?: any; candidates?: any[]; error?: string }> {
  const orgIds = await resolveAccessibleOrgIds(ctx);
  if (orgIds.size === 0) return { error: "You have no accessible organizations." };
  const accessible = Array.from(orgIds);

  if (typeof args.id === "string" && args.id) {
    if (!orgIds.has(args.id)) return { error: "Organization not found or not accessible." };
    const { data } = await ctx.admin
      .from("organizations")
      .select("id, name, color")
      .eq("id", args.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!data) return { error: "Organization not found or not accessible." };
    return { org: data };
  }

  if (typeof args.name === "string" && args.name.trim()) {
    const { data } = await ctx.admin
      .from("organizations")
      .select("id, name, color")
      .in("id", accessible)
      .is("deleted_at", null)
      .ilike("name", `%${args.name.trim()}%`);
    const matches = data || [];
    if (matches.length === 0) return { error: `No accessible organization matches "${args.name}".` };
    if (matches.length > 1) {
      const exact = matches.filter((m: any) => m.name.toLowerCase() === args.name.trim().toLowerCase());
      if (exact.length === 1) return { org: exact[0] };
      return { candidates: matches.map((m: any) => ({ id: m.id, name: m.name })) };
    }
    return { org: matches[0] };
  }

  return { error: "Provide an organization id or name." };
}

/** Resolve a project the user can access by id or name. */
async function resolveProject(
  ctx: AgentToolContext,
  args: Record<string, any>,
): Promise<{ project?: any; candidates?: any[]; error?: string }> {
  if (ctx.accessibleProjectIds.size === 0) return { error: "You have no accessible projects." };
  const accessible = Array.from(ctx.accessibleProjectIds);

  if (typeof args.id === "string" && args.id) {
    if (!ctx.accessibleProjectIds.has(args.id)) return { error: "Project not found or not accessible." };
    const { data } = await ctx.admin
      .from("projects")
      .select("id, name, color, archived, organization_id")
      .eq("id", args.id)
      .maybeSingle();
    if (!data) return { error: "Project not found or not accessible." };
    return { project: data };
  }

  if (typeof args.name === "string" && args.name.trim()) {
    const { data } = await ctx.admin
      .from("projects")
      .select("id, name, color, archived, organization_id")
      .in("id", accessible)
      .ilike("name", `%${args.name.trim()}%`);
    const matches = data || [];
    if (matches.length === 0) return { error: `No accessible project matches "${args.name}".` };
    if (matches.length > 1) {
      const exact = matches.filter((m: any) => m.name.toLowerCase() === args.name.trim().toLowerCase());
      if (exact.length === 1) return { project: exact[0] };
      return { candidates: matches.map((m: any) => ({ id: m.id, name: m.name })) };
    }
    return { project: matches[0] };
  }

  return { error: "Provide a project id or name." };
}

async function getOrganization(ctx: AgentToolContext, args: Record<string, any>): Promise<AgentToolResult> {
  const r = await resolveOrg(ctx, args);
  if (r.candidates) return { ok: true, data: { ambiguous: true, candidates: r.candidates } };
  if (!r.org) return { ok: false, error: r.error || "Organization not found." };
  const { count } = await ctx.admin
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", r.org.id);
  return {
    ok: true,
    data: { id: r.org.id, name: r.org.name, color: r.org.color ?? null, projectCount: count ?? 0 },
  };
}

async function getProject(ctx: AgentToolContext, args: Record<string, any>): Promise<AgentToolResult> {
  const r = await resolveProject(ctx, args);
  if (r.candidates) return { ok: true, data: { ambiguous: true, candidates: r.candidates } };
  if (!r.project) return { ok: false, error: r.error || "Project not found." };
  const { count } = await ctx.admin
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("project_id", r.project.id)
    .eq("completed", false);
  return {
    ok: true,
    data: {
      id: r.project.id,
      name: r.project.name,
      color: r.project.color ?? null,
      archived: Boolean(r.project.archived),
      organizationId: r.project.organization_id ?? null,
      openTaskCount: count ?? 0,
    },
  };
}

async function createOrganization(ctx: AgentToolContext, args: Record<string, any>): Promise<AgentToolResult> {
  const name = String(args.name || "").trim();
  if (!name) return { ok: false, error: "Organization name is required." };

  const insert: Record<string, any> = { name, archived: false, order_index: 0 };
  if (typeof args.color === "string" && args.color) insert.color = args.color;

  const { data: org, error } = await ctx.admin
    .from("organizations")
    .insert(insert)
    .select("id, name, color")
    .single();
  if (error) return { ok: false, error: error.message };

  // Make the creating user the owner so the org is RLS-accessible to them.
  const { error: memberError } = await ctx.admin
    .from("user_organizations")
    .insert({ user_id: ctx.userId, organization_id: org.id, is_owner: true });
  if (memberError) {
    // Roll back the orphaned org so we don't leave an inaccessible record.
    await ctx.admin.from("organizations").delete().eq("id", org.id);
    return { ok: false, error: memberError.message };
  }

  await writeAuditLog(ctx.admin, {
    organizationId: org.id,
    actorUserId: ctx.userId,
    action: "organization.create",
    entityType: "organization",
    entityId: org.id,
    metadata: { name: org.name },
  });

  return { ok: true, data: { id: org.id, name: org.name, color: org.color ?? null } };
}

async function updateOrganization(ctx: AgentToolContext, args: Record<string, any>): Promise<AgentToolResult> {
  const r = await resolveOrg(ctx, { id: args.id });
  if (!r.org) return { ok: false, error: r.error || "Organization not found or not accessible." };

  const update: Record<string, any> = {};
  if (typeof args.name === "string" && args.name.trim()) update.name = args.name.trim();
  if (typeof args.color === "string" && args.color) update.color = args.color;
  if (Object.keys(update).length === 0) return { ok: false, error: "Nothing to update (provide name and/or color)." };

  const { data, error } = await ctx.admin
    .from("organizations")
    .update(update)
    .eq("id", r.org.id)
    .select("id, name, color")
    .single();
  if (error) return { ok: false, error: error.message };

  await writeAuditLog(ctx.admin, {
    organizationId: r.org.id,
    actorUserId: ctx.userId,
    action: "organization.update",
    entityType: "organization",
    entityId: r.org.id,
    metadata: update,
  });

  return { ok: true, data: { id: data.id, name: data.name, color: data.color ?? null } };
}

async function createProject(ctx: AgentToolContext, args: Record<string, any>): Promise<AgentToolResult> {
  const orgId = String(args.organizationId || "");
  const orgIds = await resolveAccessibleOrgIds(ctx);
  if (!orgId || !orgIds.has(orgId)) {
    return { ok: false, error: "A valid, accessible organizationId is required." };
  }
  const name = String(args.name || "").trim();
  if (!name) return { ok: false, error: "Project name is required." };

  const insert: Record<string, any> = {
    name,
    organization_id: orgId,
    color: typeof args.color === "string" && args.color ? args.color : "#6B7280",
    archived: false,
    is_favorite: false,
    order_index: 0,
  };

  const { data: project, error } = await ctx.admin
    .from("projects")
    .insert(insert)
    .select("id, name, color, organization_id, archived")
    .single();
  if (error) return { ok: false, error: error.message };

  // Best-effort owner membership (mirrors adapter.syncProjectMembers intent).
  await ctx.admin
    .from("user_projects")
    .insert({ user_id: ctx.userId, project_id: project.id, is_owner: true })
    .then(undefined, () => undefined);

  await writeAuditLog(ctx.admin, {
    organizationId: orgId,
    actorUserId: ctx.userId,
    action: "project.create",
    entityType: "project",
    entityId: project.id,
    metadata: { name: project.name },
  });

  return {
    ok: true,
    data: {
      id: project.id,
      name: project.name,
      color: project.color ?? null,
      organizationId: project.organization_id,
      archived: Boolean(project.archived),
    },
  };
}

async function updateProject(ctx: AgentToolContext, args: Record<string, any>): Promise<AgentToolResult> {
  const r = await resolveProject(ctx, { id: args.id });
  if (!r.project) return { ok: false, error: r.error || "Project not found or not accessible." };

  const update: Record<string, any> = {};
  if (typeof args.name === "string" && args.name.trim()) update.name = args.name.trim();
  if (typeof args.color === "string" && args.color) update.color = args.color;
  if (typeof args.archived === "boolean") update.archived = args.archived;
  if (Object.keys(update).length === 0) {
    return { ok: false, error: "Nothing to update (provide name, color, and/or archived)." };
  }

  const { data, error } = await ctx.admin
    .from("projects")
    .update(update)
    .eq("id", r.project.id)
    .select("id, name, color, organization_id, archived")
    .single();
  if (error) return { ok: false, error: error.message };

  await writeAuditLog(ctx.admin, {
    organizationId: data.organization_id,
    actorUserId: ctx.userId,
    action: "project.update",
    entityType: "project",
    entityId: data.id,
    metadata: update,
  });

  return {
    ok: true,
    data: {
      id: data.id,
      name: data.name,
      color: data.color ?? null,
      organizationId: data.organization_id,
      archived: Boolean(data.archived),
    },
  };
}

// ---- Destructive (double-confirm gated) ----

/** Soft-delete an entity via the cascading, versioned RPC (recoverable). */
async function softDeleteEntity(
  ctx: AgentToolContext,
  entityType: "organization" | "project",
  id: string,
): Promise<string> {
  const { data: batchId, error } = await ctx.admin.rpc("soft_delete_entity", {
    p_entity_type: entityType,
    p_entity_id: id,
  });
  if (error) throw new Error(error.message);
  return batchId as string;
}

async function deleteProjectGated(ctx: AgentToolContext, args: Record<string, any>): Promise<AgentToolResult> {
  const action: DestructiveAction = "delete_project";
  const r = await resolveProject(ctx, args);
  if (r.candidates) {
    return { ok: true, data: { ambiguous: true, candidates: r.candidates, note: "Multiple projects match — ask the user which one." } };
  }
  if (!r.project) return { ok: false, error: r.error || "Project not found or not accessible." };

  const target = r.project;
  const gate = evaluateConfirmGate({
    action,
    entityId: target.id,
    confirm: args.confirm,
    confirmToken: args.confirmToken,
  });

  if (!gate.allowed) {
    // Step 1: compute impact, hand back a token, delete NOTHING.
    const [{ count: taskCount }, { count: sectionCount }] = await Promise.all([
      ctx.admin.from("tasks").select("id", { count: "exact", head: true }).eq("project_id", target.id),
      ctx.admin.from("sections").select("id", { count: "exact", head: true }).eq("project_id", target.id),
    ]);
    return {
      ok: true,
      data: {
        needsConfirmation: true,
        target: { id: target.id, name: target.name },
        impact: `Deleting project "${target.name}" will cascade-delete ${taskCount ?? 0} task(s) and ${sectionCount ?? 0} section(s). This is recoverable from Trash.`,
        confirmToken: gate.expectedToken,
        instruction:
          "Present this exact target and impact to the user and ask for explicit confirmation. Only after they clearly say yes, call delete_project again with confirm:true and this confirmToken.",
      },
    };
  }

  // Step 2: confirmed — execute the cascade soft-delete + audit log.
  const batchId = await softDeleteEntity(ctx, "project", target.id);
  await writeAuditLog(ctx.admin, {
    organizationId: target.organization_id,
    actorUserId: ctx.userId,
    action: "project.delete",
    entityType: "project",
    entityId: target.id,
    metadata: { name: target.name, batchId },
  });
  return { ok: true, data: { deleted: true, id: target.id, name: target.name, batchId } };
}

async function deleteOrganizationGated(ctx: AgentToolContext, args: Record<string, any>): Promise<AgentToolResult> {
  const action: DestructiveAction = "delete_organization";
  const r = await resolveOrg(ctx, args);
  if (r.candidates) {
    return { ok: true, data: { ambiguous: true, candidates: r.candidates, note: "Multiple organizations match — ask the user which one." } };
  }
  if (!r.org) return { ok: false, error: r.error || "Organization not found or not accessible." };

  const target = r.org;
  const gate = evaluateConfirmGate({
    action,
    entityId: target.id,
    confirm: args.confirm,
    confirmToken: args.confirmToken,
  });

  if (!gate.allowed) {
    // Step 1: compute impact, hand back a token, delete NOTHING.
    const { data: projects } = await ctx.admin
      .from("projects")
      .select("id")
      .eq("organization_id", target.id);
    const projectIds = (projects || []).map((p: any) => p.id);
    let taskCount = 0;
    if (projectIds.length) {
      const { count } = await ctx.admin
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .in("project_id", projectIds);
      taskCount = count ?? 0;
    }
    return {
      ok: true,
      data: {
        needsConfirmation: true,
        target: { id: target.id, name: target.name },
        impact: `Deleting organization "${target.name}" will cascade-delete ${projectIds.length} project(s) and their ${taskCount} task(s). This is recoverable from Trash.`,
        confirmToken: gate.expectedToken,
        instruction:
          "Present this exact target and impact to the user and ask for explicit confirmation. Only after they clearly say yes, call delete_organization again with confirm:true and this confirmToken.",
      },
    };
  }

  // Step 2: confirmed — execute the cascade soft-delete + audit log.
  const batchId = await softDeleteEntity(ctx, "organization", target.id);
  await writeAuditLog(ctx.admin, {
    organizationId: target.id,
    actorUserId: ctx.userId,
    action: "organization.delete",
    entityType: "organization",
    entityId: target.id,
    metadata: { name: target.name, batchId },
  });
  return { ok: true, data: { deleted: true, id: target.id, name: target.name, batchId } };
}

// ---- Daily prioritization executors ----

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function getDailyCapacity(ctx: AgentToolContext): Promise<AgentToolResult> {
  const today = todayStr(ctx.timezone);
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
  const today = todayStr(ctx.timezone);
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

async function listTodayView(ctx: AgentToolContext): Promise<AgentToolResult> {
  try {
    const selection = await selectTodayTasks(
      ctx.admin,
      ctx.userId,
      ctx.accessibleProjectIds,
    );
    return {
      ok: true,
      data: {
        taskCount: selection.tasks.length,
        inboxItemCount: selection.inboxItems.length,
        tasks: selection.tasks,
        inboxItems: selection.inboxItems,
        note: "This is the exact set the Today view shows: overdue + today + tomorrow + rest-of-week tasks (unsnoozed, incomplete) plus actionable inbox items.",
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to load Today view" };
  }
}

async function addTaskToToday(ctx: AgentToolContext, args: Record<string, any>): Promise<AgentToolResult> {
  const task = await loadAuthorizedTask(ctx, String(args.taskId));
  if (!task) return { ok: false, error: "Task not found or not accessible." };
  const { data, error } = await ctx.admin
    .from("tasks")
    .update({ due_date: todayStr(ctx.timezone), updated_at: new Date().toISOString() })
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
