/**
 * Direct Postgres access for when PostgREST is down (PGRST002 schema-cache).
 * Uses the direct DB host (not the pooler) — more reliable for this project.
 */
import postgres from "postgres";

let directSql: postgres.Sql | null = null;

function getDirectSql() {
  if (directSql) return directSql;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const password = process.env.SUPABASE_DB_PASSWORD;
  let projectRef = process.env.SUPABASE_PROJECT_REF?.trim() || null;
  if (!projectRef && url) {
    try {
      projectRef = new URL(url).hostname.split(".")[0] || null;
    } catch {
      projectRef = null;
    }
  }
  if (!projectRef || !password) {
    throw new Error(
      "Missing SUPABASE_PROJECT_REF/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_DB_PASSWORD for direct Postgres fallback",
    );
  }

  directSql = postgres({
    host: process.env.SUPABASE_DB_HOST || `db.${projectRef}.supabase.co`,
    port: Number(process.env.SUPABASE_DB_PORT || 5432),
    database: process.env.SUPABASE_DB_NAME || "postgres",
    username: process.env.SUPABASE_DB_USER || "postgres",
    password,
    ssl: "require",
    max: 3,
    idle_timeout: 10,
    connect_timeout: 10,
    prepare: false,
  });
  return directSql;
}

export type DirectCoreDatabase = {
  organizations: any[];
  projects: any[];
  tasks: any[];
  tags: any[];
  sections: any[];
  goals: any[];
  userProfile: any | null;
  orgMemberMap: Map<string, string[]>;
  orgOwnerMap: Map<string, string>;
  projectMemberMap: Map<string, string[]>;
  projectOwnerMap: Map<string, string>;
};

export async function loadCoreDatabaseViaPostgres(
  userId: string,
  userEmail: string | null | undefined,
): Promise<DirectCoreDatabase> {
  const sql = getDirectSql();

  const orgRows = await sql`
    SELECT o.*
    FROM organizations o
    INNER JOIN user_organizations uo ON uo.organization_id = o.id
    WHERE uo.user_id = ${userId}
      AND o.deleted_at IS NULL
    ORDER BY o.name ASC
  `;

  const projectRows = await sql`
    SELECT DISTINCT p.*
    FROM projects p
    LEFT JOIN user_projects up ON up.project_id = p.id AND up.user_id = ${userId}
    LEFT JOIN user_organizations uo ON uo.organization_id = p.organization_id AND uo.user_id = ${userId}
    WHERE p.deleted_at IS NULL
      AND (up.user_id IS NOT NULL OR uo.user_id IS NOT NULL)
    ORDER BY p.name ASC
  `;

  const projectIds = projectRows.map((p: any) => p.id as string);
  const orgIds = orgRows.map((o: any) => o.id as string);

  let taskRows: any[] = [];
  if (projectIds.length > 0) {
    taskRows = await sql`
      SELECT
        id, name, description, priority, completed, completed_at,
        due_date, due_time, project_id, section_id, goal_id, parent_id,
        assigned_to, created_by, agent_name, agent_model, created_at, updated_at,
        deleted_at, todoist_id, recurring_pattern, time_estimate,
        devnotes_meta, requires_hitl, todoist_order, snoozed_until,
        start_date, start_time, end_date, end_time,
        is_supply, supply_quantity, supply_price, supply_vendor
      FROM tasks
      WHERE deleted_at IS NULL
        AND project_id = ANY(${projectIds})
      ORDER BY created_at DESC
      LIMIT 2000
    `;
  }

  let sectionRows: any[] = [];
  if (projectIds.length > 0) {
    sectionRows = await sql`
      SELECT *
      FROM sections
      WHERE deleted_at IS NULL
        AND project_id = ANY(${projectIds})
      ORDER BY COALESCE(todoist_order, order_index, 0) ASC, created_at ASC
    `;
  }

  let goalRows: any[] = [];
  if (projectIds.length > 0) {
    goalRows = await sql`
      SELECT *
      FROM goals
      WHERE deleted_at IS NULL
        AND project_id = ANY(${projectIds})
      ORDER BY COALESCE(order_index, 0) ASC, created_at ASC
    `;
  }

  const tagRows = await sql`
    SELECT *
    FROM tags
    WHERE (user_id = ${userId} OR user_id IS NULL)
    ORDER BY name ASC
  `.catch(() => [] as any[]);

  const profileRows = await sql`
    SELECT *
    FROM profiles
    WHERE id = ${userId}
    LIMIT 1
  `.catch(() => []);

  const orgMemberMap = new Map<string, string[]>();
  const orgOwnerMap = new Map<string, string>();
  if (orgIds.length > 0) {
    const uo = await sql`
      SELECT user_id, organization_id, is_owner
      FROM user_organizations
      WHERE organization_id = ANY(${orgIds})
    `;
    for (const row of uo) {
      const list = orgMemberMap.get(row.organization_id) || [];
      if (!list.includes(row.user_id)) list.push(row.user_id);
      orgMemberMap.set(row.organization_id, list);
      if (row.is_owner && !orgOwnerMap.has(row.organization_id)) {
        orgOwnerMap.set(row.organization_id, row.user_id);
      }
    }
  }

  const projectMemberMap = new Map<string, string[]>();
  const projectOwnerMap = new Map<string, string>();
  if (projectIds.length > 0) {
    const up = await sql`
      SELECT user_id, project_id, is_owner
      FROM user_projects
      WHERE project_id = ANY(${projectIds})
    `.catch(() => [] as any[]);
    for (const row of up) {
      const list = projectMemberMap.get(row.project_id) || [];
      if (!list.includes(row.user_id)) list.push(row.user_id);
      projectMemberMap.set(row.project_id, list);
      if (row.is_owner && !projectOwnerMap.has(row.project_id)) {
        projectOwnerMap.set(row.project_id, row.user_id);
      }
    }
  }

  const profile = profileRows[0];
  const userProfile = profile
    ? {
        id: profile.id,
        email: profile.email || userEmail || "",
        firstName: profile.first_name || "",
        lastName: profile.last_name || "",
        name:
          [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
          userEmail?.split("@")[0] ||
          "User",
        role: profile.role || null,
        profileColor:
          profile.profile_color ||
          "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        profileMemoji: profile.profile_memoji || null,
        animationsEnabled: profile.animations_enabled ?? true,
        dockBadgeEnabled: profile.dock_badge_enabled ?? true,
        priorityColor: profile.priority_color || null,
        emailDeleteUndoSeconds: profile.email_delete_undo_seconds ?? 60,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
      }
    : {
        id: userId,
        email: userEmail || "",
        firstName: "",
        lastName: "",
        name: userEmail?.split("@")[0] || "User",
        role: null,
        profileColor: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        profileMemoji: null,
        animationsEnabled: true,
        dockBadgeEnabled: true,
        priorityColor: null,
        emailDeleteUndoSeconds: 60,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

  const organizations = orgRows.map((o: any) => ({
    id: o.id,
    name: o.name,
    color: o.color,
    description: o.description,
    order: o.order_index ?? 0,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
  }));

  const projects = projectRows.map((p: any) => ({
    id: p.id,
    name: p.name,
    organizationId: p.organization_id,
    color: p.color,
    description: p.description,
    goal: p.goal,
    startDate: p.start_date,
    endDate: p.end_date,
    favorite: p.favorite ?? false,
    archived: p.archived ?? false,
    order: p.order_index ?? p.todoist_order ?? 0,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  }));

  const tasks = taskRows.map((task: any) => ({
    ...task,
    projectId: task.project_id,
    dueDate: task.due_date,
    dueTime: task.due_time,
    parentId: task.parent_id,
    sectionId: task.section_id,
    goalId: task.goal_id,
    assignedTo: task.assigned_to,
    createdBy: task.created_by,
    completedAt: task.completed_at,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    todoistId: task.todoist_id,
    recurringPattern: task.recurring_pattern,
    timeEstimate: task.time_estimate,
    isSupply: task.is_supply ?? false,
    // numeric columns come back from node-postgres as strings; Number() keeps
    // the client working in numbers so subtotals never string-concatenate.
    supplyQuantity:
      task.supply_quantity === null || task.supply_quantity === undefined
        ? null
        : Number(task.supply_quantity),
    supplyPrice:
      task.supply_price === null || task.supply_price === undefined
        ? null
        : Number(task.supply_price),
    supplyVendor: task.supply_vendor,
    snoozedUntil: task.snoozed_until,
    startDate: task.start_date,
    startTime: task.start_time,
    endDate: task.end_date,
    endTime: task.end_time,
    devnotesMeta: task.devnotes_meta,
    requiresHitl: task.requires_hitl ?? false,
    agentName: task.agent_name,
    agentModel: task.agent_model,
    tags: [],
    tagBadges: [],
    reminders: [],
    attachments: [],
    files: [],
  }));

  const sections = sectionRows.map((row: any) => ({
    id: row.id,
    name: row.name,
    projectId: row.project_id,
    parentId: row.parent_id || undefined,
    goalId: row.goal_id || undefined,
    color: row.color || undefined,
    description: row.description || undefined,
    icon: row.icon || undefined,
    order: row.order_index ?? row.todoist_order ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    todoistId: row.todoist_id || undefined,
    todoistOrder: row.todoist_order ?? undefined,
  }));

  const goals = goalRows.map((row: any) => ({
    id: row.id,
    sectionId: row.section_id || undefined,
    parentGoalId: row.parent_goal_id || undefined,
    projectId: row.project_id,
    name: row.name,
    description: row.description || undefined,
    completed: row.completed ?? false,
    completedAt: row.completed_at || undefined,
    order: row.order_index ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  const tags = (tagRows as any[]).map((t) => ({
    id: t.id,
    name: t.name,
    color: t.color,
    userId: t.user_id,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  }));

  return {
    organizations,
    projects,
    tasks,
    tags,
    sections,
    goals,
    userProfile,
    orgMemberMap,
    orgOwnerMap,
    projectMemberMap,
    projectOwnerMap,
  };
}

/** Quick probe: true when PostgREST answers; false on PGRST002/network failure. */
export async function isPostgrestHealthy(): Promise<boolean> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return false;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`${url}/rest/v1/profiles?select=id&limit=1`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      signal: controller.signal,
    });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}
