import { getAdminClient } from "@/lib/supabase/admin";
import { generateApiKeySecret, extractPrefixFromSecret, hashApiKeySecret } from "@/lib/api/keys/utils";
import { getTimePostgresClient } from "./postgres";
import type {
  TimeScope,
  TimeTokenShareMode,
  TimeTrackingBootstrap,
  TimeTrackingEntry,
  TimeTrackingTokenWithSecret,
} from "./types";
import {
  mapTimeEntry,
  mapTimeGroup,
  mapTimeProject,
  mapTimeScopes,
  mapTimeSection,
  mapTimeTask,
  mapTimeToken,
  mapTimeTokenWithSecret,
  mapTimeUser,
  normalizeTimeZone,
} from "./utils";

type EntryFilters = {
  organizationId?: string | null;
  projectId?: string | null;
  sectionId?: string | null;
  taskIds?: string[];
  userIds?: string[];
  roles?: string[];
  startedAfter?: string | null;
  endedBefore?: string | null;
  query?: string | null;
};

type OrganizationMembershipRow = {
  organization_id: string | null;
};

type ProjectRow = {
  id: string | null;
  name: string | null;
  organization_id: string | null;
};

type OrganizationRow = {
  id: string | null;
  name: string | null;
};

type TimeTokenRelationRow = {
  user_id?: string | null;
  group_id?: string | null;
};

type TimeGroupRow = {
  id: string | null;
  organization_id: string | null;
  name: string | null;
  description?: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  group_members?: TimeTokenRelationRow[] | null;
};

type TimeTokenRow = {
  id: string | null;
  organization_id: string | null;
  created_by: string | null;
  name: string | null;
  description?: string | null;
  prefix: string | null;
  scopes: unknown;
  expires_at: string | null;
  last_used_at: string | null;
  is_active: boolean | null;
  share_mode: string | null;
  created_at: string | null;
  token_users?: TimeTokenRelationRow[] | null;
  token_groups?: TimeTokenRelationRow[] | null;
};

type OrgMemberRow = {
  organization_id: string | null;
  user_id: string | null;
  profiles?: unknown;
};

type ValidationTaskRow = {
  id: string | null;
  project_id: string | null;
  section_id: string | null;
  projects?: {
    organization_id?: string | null;
  } | null;
};

const TIME_ENTRY_SELECT_SQL = `
  SELECT
    e.id,
    e.organization_id,
    e.user_id,
    e.project_id,
    e.section_id,
    e.title,
    e.description,
    e.timezone,
    e.started_at,
    e.ended_at,
    e.created_at,
    e.updated_at,
    e.source,
    e.source_metadata,
    CASE
      WHEN o.id IS NULL THEN NULL
      ELSE jsonb_build_object('id', o.id, 'name', o.name)
    END AS organizations,
    CASE
      WHEN p.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', p.id,
        'email', p.email,
        'first_name', p.first_name,
        'last_name', p.last_name,
        'role', p.role
      )
    END AS profiles,
    CASE
      WHEN pr.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', pr.id,
        'name', pr.name,
        'organization_id', pr.organization_id
      )
    END AS projects,
    CASE
      WHEN s.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'project_id', s.project_id
      )
    END AS sections,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'task_id', et.task_id,
            'tasks',
            CASE
              WHEN t.id IS NULL THEN NULL
              ELSE jsonb_build_object(
                'id', t.id,
                'name', t.name,
                'project_id', t.project_id,
                'section_id', t.section_id
              )
            END
          )
          ORDER BY et.created_at, et.task_id
        )
        FROM time_tracking.entry_tasks et
        LEFT JOIN public.tasks t ON t.id = et.task_id
        WHERE et.entry_id = e.id
      ),
      '[]'::jsonb
    ) AS entry_tasks
  FROM time_tracking.entries e
  JOIN public.organizations o ON o.id = e.organization_id
  JOIN public.profiles p ON p.id = e.user_id
  LEFT JOIN public.projects pr ON pr.id = e.project_id
  LEFT JOIN public.sections s ON s.id = e.section_id
`;

export async function ensureOrgTimeAdmin(userId: string, organizationId: string) {
  const admin = getAdminClient();
  const { data, error } = await admin.rpc("is_org_admin", {
    p_user_id: userId,
    p_org_id: organizationId,
  });

  if (error) {
    throw error;
  }

  return Boolean(data);
}

export async function ensureOrgMembership(userId: string, organizationId: string) {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("user_organizations")
    .select("user_id")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

export async function getTimeBootstrap(userId: string): Promise<TimeTrackingBootstrap> {
  const admin = getAdminClient();

  const { data: memberships, error: membershipError } = await admin
    .from("user_organizations")
    .select("organization_id")
    .eq("user_id", userId);

  if (membershipError) {
    throw membershipError;
  }

  const organizationIds =
    memberships
      ?.map((row: OrganizationMembershipRow) => row.organization_id)
      .filter((value: string | null): value is string => typeof value === "string") || [];

  if (organizationIds.length === 0) {
    return {
      organizations: [],
      projects: [],
      sections: [],
      tasks: [],
      users: [],
      groups: [],
      timeTokens: [],
    };
  }

  const { data: projectRows, error: projectRowsError } = await admin
    .from("projects")
    .select("id,name,organization_id")
    .in("organization_id", organizationIds)
    .order("name");

  if (projectRowsError) {
    throw projectRowsError;
  }

  const projectIds =
    (projectRows || [])
      .map((row: ProjectRow) => row.id)
      .filter((value: string | null): value is string => typeof value === "string") || [];

  const [
    organizationsResult,
    sectionsResult,
    tasksResult,
    orgMembersResult,
    groupsResult,
    timeTokensResult,
  ] = await Promise.all([
    admin.from("organizations").select("id,name").in("id", organizationIds).order("name"),
    admin.from("sections").select("id,name,project_id").in("project_id", projectIds).order("name"),
    admin.from("tasks").select("id,name,project_id,section_id").in("project_id", projectIds).order("name"),
    admin
      .from("user_organizations")
      .select("organization_id,user_id,profiles!inner(id,email,first_name,last_name,role)")
      .in("organization_id", organizationIds),
    admin.rpc("time_list_groups", { p_org_ids: organizationIds }),
    admin.rpc("time_list_api_tokens", { p_org_ids: organizationIds }),
  ]);

  if (organizationsResult.error) throw organizationsResult.error;
  if (sectionsResult.error) throw sectionsResult.error;
  if (tasksResult.error) throw tasksResult.error;
  if (orgMembersResult.error) throw orgMembersResult.error;
  if (groupsResult.error) throw groupsResult.error;
  if (timeTokensResult.error) throw timeTokensResult.error;

  const groups = Array.isArray(groupsResult.data) ? (groupsResult.data as TimeGroupRow[]) : [];
  const timeTokens = Array.isArray(timeTokensResult.data)
    ? (timeTokensResult.data as TimeTokenRow[])
    : [];

  const visibleTokens = timeTokens.filter((row: TimeTokenRow) => {
      if (String(row.created_by) === userId) {
        return true;
      }

      const shareMode = row.share_mode;
      if (shareMode === "organization") {
        return true;
      }

      const sharedUserIds = Array.isArray(row.token_users)
        ? row.token_users.map((item: TimeTokenRelationRow) => item?.user_id)
        : [];
      if (sharedUserIds.includes(userId)) {
        return true;
      }

      const sharedGroupIds = Array.isArray(row.token_groups)
        ? row.token_groups.map((item: TimeTokenRelationRow) => item?.group_id)
        : [];
      if (sharedGroupIds.length === 0) {
        return false;
      }

      return groups.some(
        (group: TimeGroupRow) =>
          sharedGroupIds.includes(group.id) &&
          Array.isArray(group.group_members) &&
          group.group_members.some((member: TimeTokenRelationRow) => member?.user_id === userId),
      );
    });

  const users = new Map<string, ReturnType<typeof mapTimeUser>>();
  for (const row of (orgMembersResult.data || []) as OrgMemberRow[]) {
    if (row.profiles) {
      users.set(String((row.profiles as { id?: string | null }).id), mapTimeUser(row.profiles));
    }
  }

  return {
    organizations: ((organizationsResult.data || []) as OrganizationRow[]).map((row) => ({
      id: String(row.id),
      name: String(row.name),
    })),
    projects: (projectRows || []).map(mapTimeProject),
    sections: (sectionsResult.data || []).map(mapTimeSection),
    tasks: (tasksResult.data || []).map(mapTimeTask),
    users: Array.from(users.values()).sort((a, b) => a.name.localeCompare(b.name)),
    groups: groups.map(mapTimeGroup),
    timeTokens: visibleTokens.map(mapTimeToken),
  };
}

async function validateTimeRelationships(input: {
  organizationId: string;
  projectId?: string | null;
  sectionId?: string | null;
  taskIds?: string[];
}) {
  const admin = getAdminClient();

  if (input.projectId) {
    const { data, error } = await admin
      .from("projects")
      .select("id, organization_id")
      .eq("id", input.projectId)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.organization_id !== input.organizationId) {
      throw new Error("Project does not belong to the selected organization.");
    }
  }

  if (input.sectionId) {
    const { data, error } = await admin
      .from("sections")
      .select("id, project_id")
      .eq("id", input.sectionId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new Error("Task list was not found.");
    }
    const { data: sectionProject, error: sectionProjectError } = await admin
      .from("projects")
      .select("id, organization_id")
      .eq("id", data.project_id)
      .maybeSingle();
    if (sectionProjectError) throw sectionProjectError;
    if (!sectionProject || sectionProject.organization_id !== input.organizationId) {
      throw new Error("Task list does not belong to the selected organization.");
    }
    if (input.projectId && data.project_id !== input.projectId) {
      throw new Error("Task list does not belong to the selected project.");
    }
  }

  if (input.taskIds && input.taskIds.length > 0) {
    const { data, error } = await admin
      .from("tasks")
      .select("id, project_id, section_id, projects!inner(organization_id)")
      .in("id", input.taskIds);
    if (error) throw error;

    const tasks = (data || []) as ValidationTaskRow[];
    if (tasks.length !== input.taskIds.length) {
      throw new Error("One or more selected tasks were not found.");
    }

    for (const task of tasks) {
      if (task.projects?.organization_id !== input.organizationId) {
        throw new Error("One or more tasks do not belong to the selected organization.");
      }
      if (input.projectId && task.project_id !== input.projectId) {
        throw new Error("One or more tasks do not belong to the selected project.");
      }
      if (input.sectionId && task.section_id !== input.sectionId) {
        throw new Error("One or more tasks do not belong to the selected task list.");
      }
    }
  }
}

export async function listTimeEntries(
  principal:
    | { kind: "session" | "pat"; userId: string; organizationId?: never }
    | { kind: "org_token"; organizationId: string; userId?: never },
  filters: EntryFilters,
): Promise<TimeTrackingEntry[]> {
  const db = getTimePostgresClient();
  let organizationId: string | null = null;
  let userIds: string[] | null = null;

  if (principal.kind === "org_token") {
    organizationId = principal.organizationId;
    userIds = filters.userIds && filters.userIds.length > 0 ? filters.userIds : null;
  } else if (filters.organizationId) {
    const isAdmin = await ensureOrgTimeAdmin(principal.userId, filters.organizationId);
    organizationId = filters.organizationId;
    userIds = isAdmin
      ? filters.userIds && filters.userIds.length > 0
        ? filters.userIds
        : null
      : [principal.userId];
  } else {
    userIds = [principal.userId];
  }

  const conditions = ["1=1"];
  const params: Array<string | string[] | null> = [];
  const bind = (value: string | string[] | null) => {
    params.push(value);
    return `$${params.length}`;
  };

  if (organizationId) {
    conditions.push(`e.organization_id = ${bind(organizationId)}::uuid`);
  }
  if (userIds && userIds.length > 0) {
    conditions.push(`e.user_id = ANY(${bind(userIds)}::uuid[])`);
  }
  if (filters.projectId) {
    conditions.push(`e.project_id = ${bind(filters.projectId)}::uuid`);
  }
  if (filters.sectionId) {
    conditions.push(`e.section_id = ${bind(filters.sectionId)}::uuid`);
  }
  if (filters.startedAfter) {
    conditions.push(`e.started_at >= ${bind(filters.startedAfter)}::timestamptz`);
  }
  if (filters.endedBefore) {
    conditions.push(`COALESCE(e.ended_at, e.started_at) <= ${bind(filters.endedBefore)}::timestamptz`);
  }

  const rows = await db.unsafe(
    `
      ${TIME_ENTRY_SELECT_SQL}
      WHERE ${conditions.join(" AND ")}
      ORDER BY e.started_at DESC
    `,
    params,
  );

  let entries = rows.map(mapTimeEntry);

  if (filters.taskIds && filters.taskIds.length > 0) {
    const taskIdSet = new Set(filters.taskIds);
    entries = entries.filter((entry: TimeTrackingEntry) =>
      entry.taskIds.some((taskId: string) => taskIdSet.has(taskId)),
    );
  }

  if (filters.roles && filters.roles.length > 0) {
    const roleSet = new Set(filters.roles);
    entries = entries.filter(
      (entry: TimeTrackingEntry) => Boolean(entry.user?.role && roleSet.has(entry.user.role)),
    );
  }

  const search = filters.query?.trim().toLowerCase();
  if (search) {
    entries = entries.filter((entry: TimeTrackingEntry) => {
      const haystack = [
        entry.title,
        entry.description || "",
        entry.user?.name || "",
        entry.project?.name || "",
        entry.section?.name || "",
        ...(entry.tasks || []).map((task: NonNullable<TimeTrackingEntry["tasks"]>[number]) => task.name),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });
  }

  return entries;
}

export async function getCurrentTimeEntry(
  principal:
    | { kind: "session" | "pat"; userId: string; organizationId?: never }
    | { kind: "org_token"; organizationId: string; userId?: never },
  requestedUserId?: string | null,
) {
  const admin = getAdminClient();
  const { data, error } = await admin.rpc("time_get_current_entry", {
    p_org_id: principal.kind === "org_token" ? principal.organizationId : null,
    p_user_id:
      principal.kind === "org_token" ? requestedUserId || null : requestedUserId || principal.userId,
  });
  if (error) {
    throw error;
  }

  return data ? mapTimeEntry(data) : null;
}

export async function createTimeEntry(input: {
  organizationId: string;
  userId: string;
  projectId?: string | null;
  sectionId?: string | null;
  taskIds?: string[];
  title: string;
  description?: string | null;
  timezone?: string | null;
  startedAt: string;
  endedAt?: string | null;
  source?: string;
  sourceMetadata?: Record<string, unknown>;
}) {
  const db = getTimePostgresClient();
  const {
    taskIds = [],
    organizationId,
    userId,
    projectId = null,
    sectionId = null,
    title,
    description = null,
    timezone,
    startedAt,
    endedAt = null,
    source = "focus_forge",
    sourceMetadata = {},
  } = input;

  await validateTimeRelationships({
    organizationId,
    projectId,
    sectionId,
    taskIds,
  });

  const inserted = await db.begin(async (tx) => {
    const rows = await tx.unsafe<{ id: string }[]>(
      `
        INSERT INTO time_tracking.entries (
          organization_id,
          user_id,
          project_id,
          section_id,
          title,
          description,
          timezone,
          started_at,
          ended_at,
          source,
          source_metadata
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          $5,
          $6,
          $7,
          $8::timestamptz,
          $9::timestamptz,
          $10,
          $11::jsonb
        )
        RETURNING id
      `,
      [
        organizationId,
        userId,
        projectId,
        sectionId,
        title,
        description,
        normalizeTimeZone(timezone),
        startedAt,
        endedAt,
        source,
        JSON.stringify(sourceMetadata),
      ],
    );

    const entryId = rows[0]?.id;
    if (!entryId) {
      throw new Error("Failed to create time entry.");
    }

    if (taskIds.length > 0) {
      await tx.unsafe(
        `
          INSERT INTO time_tracking.entry_tasks (entry_id, task_id)
          SELECT $1::uuid, task_id
          FROM unnest($2::uuid[]) AS task_id
        `,
        [entryId, taskIds],
      );
    }

    return entryId;
  });

  return getTimeEntryById(String(inserted));
}

export async function getTimeEntryById(id: string) {
  const db = getTimePostgresClient();
  const rows = await db.unsafe(
    `
      ${TIME_ENTRY_SELECT_SQL}
      WHERE e.id = $1::uuid
      LIMIT 1
    `,
    [id],
  );

  if (!rows[0]) {
    throw new Error("Time entry not found.");
  }
  return mapTimeEntry(rows[0]);
}

export async function updateTimeEntry(
  id: string,
  updates: {
    organizationId?: string;
    userId?: string;
    projectId?: string | null;
    sectionId?: string | null;
    taskIds?: string[];
    title?: string;
    description?: string | null;
    timezone?: string | null;
    startedAt?: string;
    endedAt?: string | null;
    sourceMetadata?: Record<string, unknown>;
  },
) {
  const db = getTimePostgresClient();
  const current = await getTimeEntryById(id);
  const nextOrganizationId = updates.organizationId || current.organizationId;
  const nextProjectId =
    updates.projectId !== undefined ? updates.projectId : current.projectId;
  const nextSectionId =
    updates.sectionId !== undefined ? updates.sectionId : current.sectionId;
  const nextTaskIds = updates.taskIds || current.taskIds;

  await validateTimeRelationships({
    organizationId: nextOrganizationId,
    projectId: nextProjectId,
    sectionId: nextSectionId,
    taskIds: nextTaskIds,
  });

  await db.begin(async (tx) => {
    await tx.unsafe(
      `
        UPDATE time_tracking.entries
        SET
          organization_id = $2::uuid,
          user_id = $3::uuid,
          project_id = $4::uuid,
          section_id = $5::uuid,
          title = $6,
          description = $7,
          timezone = $8,
          started_at = $9::timestamptz,
          ended_at = $10::timestamptz,
          source_metadata = $11::jsonb
        WHERE id = $1::uuid
      `,
      [
        id,
        nextOrganizationId,
        updates.userId ?? current.userId,
        nextProjectId,
        nextSectionId,
        updates.title ?? current.title,
        updates.description !== undefined ? updates.description : current.description,
        normalizeTimeZone(updates.timezone ?? current.timezone),
        updates.startedAt ?? current.startedAt,
        updates.endedAt !== undefined ? updates.endedAt : current.endedAt,
        JSON.stringify(
          updates.sourceMetadata !== undefined
            ? updates.sourceMetadata
            : current.sourceMetadata,
        ),
      ],
    );

    await tx.unsafe(
      `DELETE FROM time_tracking.entry_tasks WHERE entry_id = $1::uuid`,
      [id],
    );

    if (nextTaskIds.length > 0) {
      await tx.unsafe(
        `
          INSERT INTO time_tracking.entry_tasks (entry_id, task_id)
          SELECT $1::uuid, task_id
          FROM unnest($2::uuid[]) AS task_id
        `,
        [id, nextTaskIds],
      );
    }
  });

  return getTimeEntryById(id);
}

export async function deleteTimeEntry(id: string) {
  const db = getTimePostgresClient();
  await db.unsafe(`DELETE FROM time_tracking.entries WHERE id = $1::uuid`, [id]);
}

export async function createTimeToken(input: {
  organizationId: string;
  createdBy: string;
  name: string;
  description?: string | null;
  scopes: TimeScope[];
  expiresAt: string;
  shareMode: TimeTokenShareMode;
  sharedUserIds?: string[];
  sharedGroupIds?: string[];
}) {
  const admin = getAdminClient();
  const secret = generateApiKeySecret("fft_org_");
  const prefix = extractPrefixFromSecret(secret);
  const hashedKey = hashApiKeySecret(secret);

  const { data, error } = await admin
    .schema("time_tracking")
    .from("api_tokens")
    .insert({
      organization_id: input.organizationId,
      created_by: input.createdBy,
      name: input.name,
      description: input.description ?? null,
      prefix,
      hashed_key: hashedKey,
      scopes: mapTimeScopes(input.scopes),
      expires_at: input.expiresAt,
      share_mode: input.shareMode,
    })
    .select(
      "id,organization_id,created_by,name,description,prefix,scopes,expires_at,last_used_at,is_active,share_mode,created_at,token_users(user_id),token_groups(group_id)",
    )
    .single();

  if (error) {
    throw error;
  }

  if (input.sharedUserIds && input.sharedUserIds.length > 0) {
    const { error: userError } = await admin
      .schema("time_tracking")
      .from("api_token_users")
      .insert(input.sharedUserIds.map((userId) => ({ token_id: data.id, user_id: userId })));

    if (userError) {
      throw userError;
    }
  }

  if (input.sharedGroupIds && input.sharedGroupIds.length > 0) {
    const { error: groupError } = await admin
      .schema("time_tracking")
      .from("api_token_groups")
      .insert(input.sharedGroupIds.map((groupId) => ({ token_id: data.id, group_id: groupId })));

    if (groupError) {
      throw groupError;
    }
  }

  const { data: hydrated, error: hydratedError } = await admin
    .schema("time_tracking")
    .from("api_tokens")
    .select(
      "id,organization_id,created_by,name,description,prefix,scopes,expires_at,last_used_at,is_active,share_mode,created_at,token_users(user_id),token_groups(group_id)",
    )
    .eq("id", data.id)
    .single();

  if (hydratedError) {
    throw hydratedError;
  }

  return mapTimeTokenWithSecret(hydrated, secret);
}

export async function listTimeTokens(organizationId: string) {
  const admin = getAdminClient();
  const { data, error } = await admin
    .schema("time_tracking")
    .from("api_tokens")
    .select(
      "id,organization_id,created_by,name,description,prefix,scopes,expires_at,last_used_at,is_active,share_mode,created_at,token_users(user_id),token_groups(group_id)",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map(mapTimeToken);
}

export async function revokeTimeToken(organizationId: string, tokenId: string) {
  const admin = getAdminClient();
  const { error } = await admin
    .schema("time_tracking")
    .from("api_tokens")
    .update({ is_active: false })
    .eq("organization_id", organizationId)
    .eq("id", tokenId);

  if (error) {
    throw error;
  }
}

export async function listTimeGroups(organizationId: string) {
  const admin = getAdminClient();
  const { data, error } = await admin
    .schema("time_tracking")
    .from("groups")
    .select("id,organization_id,name,description,created_by,created_at,updated_at,group_members(user_id)")
    .eq("organization_id", organizationId)
    .order("name");

  if (error) {
    throw error;
  }

  return (data || []).map(mapTimeGroup);
}

export async function createTimeGroup(input: {
  organizationId: string;
  createdBy: string;
  name: string;
  description?: string | null;
  memberIds?: string[];
}) {
  const admin = getAdminClient();
  const { data, error } = await admin
    .schema("time_tracking")
    .from("groups")
    .insert({
      organization_id: input.organizationId,
      created_by: input.createdBy,
      name: input.name,
      description: input.description ?? null,
    })
    .select("id,organization_id,name,description,created_by,created_at,updated_at")
    .single();

  if (error) {
    throw error;
  }

  const memberIds = Array.from(new Set(input.memberIds || []));
  if (memberIds.length > 0) {
    const { error: memberError } = await admin
      .schema("time_tracking")
      .from("group_members")
      .insert(memberIds.map((userId) => ({ group_id: data.id, user_id: userId })));

    if (memberError) {
      throw memberError;
    }
  }

  const { data: hydrated, error: hydratedError } = await admin
    .schema("time_tracking")
    .from("groups")
    .select("id,organization_id,name,description,created_by,created_at,updated_at,group_members(user_id)")
    .eq("id", data.id)
    .single();

  if (hydratedError) {
    throw hydratedError;
  }

  return mapTimeGroup(hydrated);
}
