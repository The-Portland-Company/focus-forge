// MCP tools for the top-level organization / project surface + project and
// section (task-list) CRUD. These answer "list all my projects" (grouped by
// org), enumerate organizations the caller belongs to, walk the accessible
// tree, and let the model create/rename projects and manage sections — giving
// the connector parity with what the web app can do to projects/goals/tasks.
//
// Lives in its own module so it registers via lib/mcp/server/registry.ts
// without touching the existing planning/email tool files. Reads use the
// "read" scope, writes use "write" (same scopes the existing tools use).
import {
  createServiceSupabase,
  getMobileAdapterForUser,
} from "@/lib/mobile/api";
import type { McpTool, McpToolResult } from "@/lib/mcp/server/types";
import { getUserOrgIds } from "@/lib/db/project-orgs";

export type { McpTool };

// structuredContent MUST be a JSON object, not a bare array (strict MCP clients
// reject arrays). Wrap arrays as { items: [...] }.
const toResult = (value: unknown): McpToolResult => ({
  content: [{ type: "text", text: JSON.stringify(value ?? null) }],
  structuredContent: Array.isArray(value) ? { items: value } : value,
});

const errorResult = (message: string): McpToolResult => ({
  content: [{ type: "text", text: JSON.stringify({ error: message }) }],
  isError: true,
});

async function assertProjectAccess(userId: string, projectId: string) {
  const adapter = await getMobileAdapterForUser(userId);
  const projects = await adapter.getProjects();
  if (!projects.some((project: any) => project.id === projectId)) {
    throw new Error("project_not_found_or_not_accessible");
  }
}

/** Orgs the caller belongs to, with role derived from user_organizations.is_owner. */
async function loadCallerOrgs(
  userId: string,
): Promise<Array<{ id: string; name: string; color: string | null; role: "owner" | "member" }>> {
  const supabase = createServiceSupabase();
  const { data: memberships } = await supabase
    .from("user_organizations")
    .select("organization_id,is_owner")
    .eq("user_id", userId);
  const rows = memberships ?? [];
  if (rows.length === 0) return [];
  const ownerById = new Map<string, boolean>(
    rows.map((r: { organization_id: string; is_owner: boolean | null }) => [
      r.organization_id,
      Boolean(r.is_owner),
    ]),
  );
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id,name,color")
    .in("id", Array.from(ownerById.keys()))
    .is("deleted_at", null)
    .order("order_index", { ascending: true });
  return (orgs ?? []).map((o: { id: string; name: string; color: string | null }) => ({
    id: o.id,
    name: o.name,
    color: o.color ?? null,
    role: ownerById.get(o.id) ? "owner" : "member",
  }));
}

export const PROJECTS_MCP_TOOLS: McpTool[] = [
  {
    name: "list_organizations",
    title: "List organizations",
    description:
      "List every organization the caller belongs to (id, name, role). Start here, or with list_projects, for any question about the caller's organizations or projects. Does NOT touch email/threads.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    requiredScopes: ["read"],
    handler: async (_args, ctx) => {
      const orgs = await loadCallerOrgs(ctx.userId);
      return toResult({ organizations: orgs });
    },
  },
  {
    name: "list_projects",
    title: "List projects",
    description:
      "List ALL projects the caller can see, grouped by organization. This is the tool that answers \"list my projects\" / \"what are my projects\". No arguments required; pass orgId to list only one organization's projects. Returns organizations each with their projects (project id, name, color, archived). This is about work projects, NOT email threads or mailboxes — never use an email/thread tool to answer a project question.",
    inputSchema: {
      type: "object",
      properties: {
        orgId: {
          type: "string",
          description: "Optional. Only return projects owned by / shared into this organization.",
        },
        includeArchived: {
          type: "boolean",
          description: "Optional. Include archived projects (default false).",
        },
      },
      additionalProperties: false,
    },
    requiredScopes: ["read"],
    handler: async (args, ctx) => {
      const orgIdFilter = typeof args?.orgId === "string" && args.orgId ? args.orgId : null;
      const includeArchived = args?.includeArchived === true;

      const adapter = await getMobileAdapterForUser(ctx.userId);
      const [projects, orgs] = await Promise.all([
        orgIdFilter ? adapter.getProjects(orgIdFilter) : adapter.getProjects(),
        loadCallerOrgs(ctx.userId),
      ]);

      const orgName = new Map<string, string>(orgs.map((o) => [o.id, o.name]));

      // Bucket each project under every org it belongs to (primary + shared).
      type Bucket = {
        organizationId: string;
        organizationName: string;
        projects: Array<{ id: string; name: string; color: string | null; archived: boolean }>;
      };
      const buckets = new Map<string, Bucket>();
      const ensureBucket = (id: string): Bucket => {
        let b = buckets.get(id);
        if (!b) {
          b = { organizationId: id, organizationName: orgName.get(id) ?? "(unknown org)", projects: [] };
          buckets.set(id, b);
        }
        return b;
      };
      // Seed buckets for every org the caller belongs to so empty orgs still show.
      for (const o of orgs) {
        if (!orgIdFilter || o.id === orgIdFilter) ensureBucket(o.id);
      }

      let total = 0;
      for (const p of projects as any[]) {
        if (!includeArchived && p.archived) continue;
        const ids: string[] =
          Array.isArray(p.organizationIds) && p.organizationIds.length > 0
            ? p.organizationIds
            : p.organizationId
              ? [p.organizationId]
              : [];
        const targetIds = orgIdFilter ? ids.filter((id) => id === orgIdFilter) : ids;
        const entry = {
          id: p.id,
          name: p.name,
          color: p.color ?? null,
          archived: Boolean(p.archived),
        };
        for (const id of targetIds.length > 0 ? targetIds : ["(no organization)"]) {
          ensureBucket(id).projects.push(entry);
        }
        total += 1;
      }

      const organizations = Array.from(buckets.values())
        .map((b) => ({
          ...b,
          projects: b.projects.sort((a, z) => a.name.localeCompare(z.name)),
        }))
        .sort((a, z) => a.organizationName.localeCompare(z.organizationName));

      return toResult({ totalProjects: total, organizations });
    },
  },
  {
    name: "get_tree",
    title: "Get project tree",
    description:
      "Get the full tree (sections/task-lists, goals and tasks) for one project, or — when no projectId is given — a compact tree of every project the caller can access, grouped by organization. Use this to see a project's structure before creating goals/tasks.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "Optional. Omit to get the accessible tree across all projects.",
        },
      },
      additionalProperties: false,
    },
    requiredScopes: ["read"],
    handler: async (args, ctx) => {
      const projectId = typeof args?.projectId === "string" ? args.projectId : "";
      const supabase = createServiceSupabase();

      const treeForProject = async (pid: string) => {
        const [{ data: sections }, { data: goals }, { data: tasks }] = await Promise.all([
          supabase
            .from("sections")
            .select("id,name,order_index,goal_id")
            .eq("project_id", pid)
            .is("deleted_at", null)
            .order("order_index", { ascending: true }),
          supabase
            .from("goals")
            .select("id,name,description,section_id,parent_goal_id,completed,order_index")
            .eq("project_id", pid)
            .is("deleted_at", null)
            .order("order_index", { ascending: true }),
          supabase
            .from("tasks")
            .select(
              "id,name,description,goal_id,parent_id,section_id,completed,status,priority,time_estimate,due_date,assigned_to",
            )
            .eq("project_id", pid)
            .is("deleted_at", null)
            .order("order_index", { ascending: true }),
        ]);
        return { sections: sections ?? [], goals: goals ?? [], tasks: tasks ?? [] };
      };

      if (projectId) {
        try {
          await assertProjectAccess(ctx.userId, projectId);
        } catch {
          return errorResult("project_not_found_or_not_accessible");
        }
        return toResult({ projectId, ...(await treeForProject(projectId)) });
      }

      // No projectId: accessible tree for every project (capped for size).
      const adapter = await getMobileAdapterForUser(ctx.userId);
      const projects = (await adapter.getProjects()) as any[];
      const orgs = await loadCallerOrgs(ctx.userId);
      const orgName = new Map<string, string>(orgs.map((o) => [o.id, o.name]));
      const CAP = 40;
      const capped = projects.slice(0, CAP);
      const trees = await Promise.all(
        capped.map(async (p) => ({
          projectId: p.id,
          name: p.name,
          organizationId: p.organizationId ?? null,
          organizationName: p.organizationId ? orgName.get(p.organizationId) ?? null : null,
          ...(await treeForProject(p.id)),
        })),
      );
      return toResult({
        totalProjects: projects.length,
        returnedProjects: trees.length,
        truncated: projects.length > CAP,
        projects: trees,
      });
    },
  },
  {
    name: "create_project",
    title: "Create project",
    description:
      "Create a new project inside an organization the caller belongs to. Requires orgId and name.",
    inputSchema: {
      type: "object",
      properties: {
        orgId: { type: "string", description: "The organization to create the project in." },
        name: { type: "string" },
        description: { type: "string" },
        color: { type: "string", description: "Hex color, e.g. #6B7280." },
        deadline: { type: "string", description: "ISO8601 date/time." },
      },
      required: ["orgId", "name"],
      additionalProperties: false,
    },
    requiredScopes: ["write"],
    handler: async (args, ctx) => {
      const orgId = String(args?.orgId ?? "");
      const name = String(args?.name ?? "").trim();
      if (!orgId || !name) return errorResult("orgId and name are required");

      const supabase = createServiceSupabase();
      const callerOrgIds = await getUserOrgIds(supabase, ctx.userId);
      if (!callerOrgIds.includes(orgId)) {
        return errorResult("organization_not_found_or_not_accessible");
      }

      const adapter = await getMobileAdapterForUser(ctx.userId);
      try {
        const project = await adapter.createProject({
          name,
          organization_id: orgId,
          description: typeof args?.description === "string" ? args.description : null,
          color: typeof args?.color === "string" ? args.color : undefined,
          deadline: typeof args?.deadline === "string" ? args.deadline : null,
          created_by: ctx.userId,
        });
        return toResult(project);
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "failed_to_create_project");
      }
    },
  },
  {
    name: "update_project",
    title: "Update project",
    description:
      "Update a project's name, description, color, deadline, archived or favorite state.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        color: { type: "string" },
        deadline: { type: "string" },
        archived: { type: "boolean" },
        isFavorite: { type: "boolean" },
      },
      required: ["projectId"],
      additionalProperties: false,
    },
    requiredScopes: ["write"],
    handler: async (args, ctx) => {
      const projectId = String(args?.projectId ?? "");
      if (!projectId) return errorResult("projectId is required");
      try {
        await assertProjectAccess(ctx.userId, projectId);
      } catch {
        return errorResult("project_not_found_or_not_accessible");
      }

      const updates: Record<string, unknown> = {};
      if (typeof args?.name === "string") updates.name = args.name;
      if (typeof args?.description === "string") updates.description = args.description;
      if (typeof args?.color === "string") updates.color = args.color;
      if (typeof args?.deadline === "string") updates.deadline = args.deadline;
      if (typeof args?.archived === "boolean") updates.archived = args.archived;
      if (typeof args?.isFavorite === "boolean") updates.is_favorite = args.isFavorite;
      if (Object.keys(updates).length === 0) return errorResult("no_fields_to_update");
      updates.updated_at = new Date().toISOString();

      const supabase = createServiceSupabase();
      const { data, error } = await supabase
        .from("projects")
        .update(updates)
        .eq("id", projectId)
        .select()
        .single();
      if (error) return errorResult(error.message);
      return toResult(data);
    },
  },
  {
    name: "create_section",
    title: "Create section (task-list)",
    description:
      "Create a section (task-list) in a project. Sections group tasks/goals. Requires projectId and name; optional goalId (section under a goal), parentId (nested section), color, icon, description, order.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        name: { type: "string" },
        goalId: { type: "string" },
        parentId: { type: "string" },
        color: { type: "string" },
        icon: { type: "string" },
        description: { type: "string" },
        order: { type: "number" },
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

      const now = new Date().toISOString();
      const insertPayload: Record<string, unknown> = {
        name,
        project_id: projectId,
        todoist_order: typeof args?.order === "number" ? args.order : 0,
        order_index: typeof args?.order === "number" ? args.order : 0,
        created_at: now,
        updated_at: now,
      };
      if (typeof args?.goalId === "string" && args.goalId) insertPayload.goal_id = args.goalId;
      if (typeof args?.parentId === "string" && args.parentId) insertPayload.parent_id = args.parentId;
      if (typeof args?.color === "string") insertPayload.color = args.color;
      if (typeof args?.icon === "string") insertPayload.icon = args.icon;
      if (typeof args?.description === "string" && args.description.trim()) {
        insertPayload.description = args.description.trim();
      }

      const supabase = createServiceSupabase();
      const { data, error } = await supabase
        .from("sections")
        .insert(insertPayload)
        .select()
        .single();
      if (error) return errorResult(error.message);
      return toResult(data);
    },
  },
  {
    name: "update_section",
    title: "Update section (task-list)",
    description: "Update a section's name, goal, parent, color, icon, description or order.",
    inputSchema: {
      type: "object",
      properties: {
        sectionId: { type: "string" },
        name: { type: "string" },
        goalId: { type: "string" },
        parentId: { type: "string" },
        color: { type: "string" },
        icon: { type: "string" },
        description: { type: "string" },
        order: { type: "number" },
      },
      required: ["sectionId"],
      additionalProperties: false,
    },
    requiredScopes: ["write"],
    handler: async (args, ctx) => {
      const sectionId = String(args?.sectionId ?? "");
      if (!sectionId) return errorResult("sectionId is required");
      const supabase = createServiceSupabase();
      const { data: section } = await supabase
        .from("sections")
        .select("project_id")
        .eq("id", sectionId)
        .maybeSingle();
      if (!section?.project_id) return errorResult("section_not_found");
      try {
        await assertProjectAccess(ctx.userId, section.project_id);
      } catch {
        return errorResult("project_not_found_or_not_accessible");
      }

      const updates: Record<string, unknown> = {};
      if (typeof args?.name === "string") updates.name = args.name;
      if (typeof args?.goalId === "string") updates.goal_id = args.goalId || null;
      if (typeof args?.parentId === "string") updates.parent_id = args.parentId || null;
      if (typeof args?.color === "string") updates.color = args.color;
      if (typeof args?.icon === "string") updates.icon = args.icon;
      if (typeof args?.description === "string") updates.description = args.description;
      if (typeof args?.order === "number") {
        updates.todoist_order = args.order;
        updates.order_index = args.order;
      }
      if (Object.keys(updates).length === 0) return errorResult("no_fields_to_update");
      updates.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from("sections")
        .update(updates)
        .eq("id", sectionId)
        .select()
        .single();
      if (error) return errorResult(error.message);
      return toResult(data);
    },
  },
  {
    name: "delete_section",
    title: "Delete section (task-list)",
    description:
      "Soft-delete a section (task-list). Tasks in it are not deleted; they lose their section placement.",
    inputSchema: {
      type: "object",
      properties: { sectionId: { type: "string" } },
      required: ["sectionId"],
      additionalProperties: false,
    },
    requiredScopes: ["write"],
    handler: async (args, ctx) => {
      const sectionId = String(args?.sectionId ?? "");
      if (!sectionId) return errorResult("sectionId is required");
      const supabase = createServiceSupabase();
      const { data: section } = await supabase
        .from("sections")
        .select("project_id")
        .eq("id", sectionId)
        .maybeSingle();
      if (!section?.project_id) return errorResult("section_not_found");
      try {
        await assertProjectAccess(ctx.userId, section.project_id);
      } catch {
        return errorResult("project_not_found_or_not_accessible");
      }
      const { error } = await supabase
        .from("sections")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", sectionId);
      if (error) return errorResult(error.message);
      return toResult({ id: sectionId, deleted: true });
    },
  },
  {
    name: "list_members",
    title: "List organization members",
    description:
      "List the members of an organization (user id, name, email) so tasks can be assigned to them. Requires orgId.",
    inputSchema: {
      type: "object",
      properties: {
        orgId: { type: "string", description: "The organization whose members to list." },
      },
      required: ["orgId"],
      additionalProperties: false,
    },
    requiredScopes: ["read"],
    handler: async (args, ctx) => {
      const orgId = String(args?.orgId ?? "");
      if (!orgId) return errorResult("orgId is required");
      const supabase = createServiceSupabase();
      const callerOrgIds = await getUserOrgIds(supabase, ctx.userId);
      if (!callerOrgIds.includes(orgId)) {
        return errorResult("organization_not_found_or_not_accessible");
      }
      const { data: memberships, error } = await supabase
        .from("user_organizations")
        .select("user_id,is_owner")
        .eq("organization_id", orgId);
      if (error) return errorResult(error.message);
      const rows = memberships ?? [];
      const ids = rows.map((r: { user_id: string }) => r.user_id);
      const ownerById = new Map<string, boolean>(
        rows.map((r: { user_id: string; is_owner: boolean | null }) => [r.user_id, Boolean(r.is_owner)]),
      );
      let profiles: any[] = [];
      if (ids.length > 0) {
        const { data } = await supabase
          .from("profiles")
          .select("id,first_name,last_name,email")
          .in("id", ids);
        profiles = data ?? [];
      }
      const profById = new Map<string, any>(profiles.map((p) => [p.id, p]));
      const members = ids.map((id) => {
        const p = profById.get(id);
        const name = p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || p.email || null : null;
        return {
          userId: id,
          name,
          email: p?.email ?? null,
          role: ownerById.get(id) ? "owner" : "member",
        };
      });
      return toResult({ organizationId: orgId, members });
    },
  },
];
