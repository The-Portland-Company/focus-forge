import { createClient } from "@/lib/supabase/server";
import { Database, DatabaseAdapter } from "./types";
import { getAdminClient } from "@/lib/supabase/admin";
import { normalizeTaskContentFields } from "@/lib/devnotes-meta";
import { writeAuditLog as writeAuditLogEntry } from "@/lib/audit/log";
import type { AuditLogEntry } from "@/lib/audit/log";

type OrganizationInput = {
  name?: string;
  color?: string;
  description?: string | null;
  archived?: boolean;
  order?: number;
  order_index?: number;
  ownerId?: string | null;
  memberIds?: string[];
};

type OrganizationMembershipRow = {
  user_id: string;
  is_owner: boolean | null;
};

type ProjectInput = {
  name?: string;
  color?: string;
  description?: string | null;
  devnotesMeta?: string | null;
  devnotes_meta?: string | null;
  archived?: boolean;
  budget?: number | null;
  deadline?: string | null;
  isFavorite?: boolean;
  is_favorite?: boolean;
  organizationId?: string;
  organization_id?: string;
  order?: number;
  order_index?: number;
  todoistId?: string | null;
  todoist_id?: string | null;
  ownerId?: string | null;
  memberIds?: string[];
};

type ProjectMembershipRow = {
  user_id: string;
  is_owner: boolean | null;
};

type UserOrganizationScopeRow = {
  organization_id: string;
  is_owner: boolean | null;
};

type ProjectScopeRow = {
  id: string;
  organization_id: string;
};

export function resolveVisibleProjectIds({
  orgMemberships,
  explicitProjects,
}: {
  orgMemberships: UserOrganizationScopeRow[];
  explicitProjects: ProjectScopeRow[];
}) {
  const fullyVisibleOrganizationIds = new Set<string>();
  const explicitProjectIds = new Set<string>();
  const explicitProjectsByOrganization = new Map<string, string[]>();

  for (const project of explicitProjects) {
    explicitProjectIds.add(project.id);
    const orgProjectIds =
      explicitProjectsByOrganization.get(project.organization_id) || [];
    orgProjectIds.push(project.id);
    explicitProjectsByOrganization.set(project.organization_id, orgProjectIds);
  }

  for (const membership of orgMemberships) {
    const orgId = membership.organization_id;
    const hasExplicitProjects = explicitProjectsByOrganization.has(orgId);

    if (membership.is_owner || !hasExplicitProjects) {
      fullyVisibleOrganizationIds.add(orgId);
    }
  }

  return {
    fullyVisibleOrganizationIds,
    explicitProjectIds,
  };
}

export class SupabaseAdapter implements DatabaseAdapter {
  private supabase: any;
  private userId: string;

  // Instance-scoped memoization. A single loadDatabase() call invokes
  // getOrganizations() + getProjects() + getTasks() (which itself calls
  // getProjects() again), each of which independently re-queried
  // user_organizations / user_projects. One adapter == one consistent load, so
  // we cache these membership reads and the no-arg getProjects() result on the
  // instance. This collapses ~3x user_organizations + ~2x user_projects reads
  // per load down to one each.
  private _orgMembershipsPromise: Promise<
    Array<{ organization_id: string; is_owner: boolean | null }>
  > | null = null;
  private _userProjectIdsPromise: Promise<string[]> | null = null;
  private _projectsPromise: Promise<any[]> | null = null;

  constructor(supabase: any, userId: string) {
    this.supabase = supabase;
    this.userId = userId;
    console.log("🔧 SupabaseAdapter initialized with userId:", userId);
  }

  private getOrgMemberships() {
    if (!this._orgMembershipsPromise) {
      this._orgMembershipsPromise = (async () => {
        const { data, error } = await this.supabase
          .from("user_organizations")
          .select("organization_id,is_owner")
          .eq("user_id", this.userId);
        if (error) {
          // Don't cache failures.
          this._orgMembershipsPromise = null;
          throw error;
        }
        return (data || []) as Array<{
          organization_id: string;
          is_owner: boolean | null;
        }>;
      })();
    }
    return this._orgMembershipsPromise;
  }

  private getUserProjectIds() {
    if (!this._userProjectIdsPromise) {
      this._userProjectIdsPromise = (async () => {
        const { data, error } = await this.supabase
          .from("user_projects")
          .select("project_id")
          .eq("user_id", this.userId);
        if (error) {
          this._userProjectIdsPromise = null;
          throw error;
        }
        return ((data || []) as Array<{ project_id: string | null }>)
          .map((row) => row.project_id)
          .filter(Boolean) as string[];
      })();
    }
    return this._userProjectIdsPromise;
  }

  async getDatabase(): Promise<Database> {
    // This method is not used in Supabase adapter as we query directly
    throw new Error("getDatabase not implemented for Supabase adapter");
  }

  async saveDatabase(database: Database): Promise<void> {
    // This method is not used in Supabase adapter as we update directly
    throw new Error("saveDatabase not implemented for Supabase adapter");
  }

  // Organizations
  async getOrganizations(userId?: string) {
    const supabase = this.supabase;
    const targetUserId = userId || this.userId;

    console.log(
      "🔍 SupabaseAdapter.getOrganizations - Fetching for user:",
      targetUserId,
    );

    // Get organizations the user belongs to. Reuse the instance-cached
    // membership read when fetching for the adapter's own user.
    let userOrgs: Array<{ organization_id: string }> | null = null;
    let userOrgsError: any = null;
    if (targetUserId === this.userId) {
      try {
        userOrgs = await this.getOrgMemberships();
      } catch (error) {
        userOrgsError = error;
      }
    } else {
      const result = await supabase
        .from("user_organizations")
        .select("organization_id")
        .eq("user_id", targetUserId);
      userOrgs = result.data;
      userOrgsError = result.error;
    }

    console.log("📊 User organizations query result:", {
      userOrgs,
      userOrgsError,
      count: userOrgs?.length,
    });

    if (userOrgsError) {
      console.error("❌ Error fetching user organizations:", userOrgsError);
      return [];
    }

    if (!userOrgs || userOrgs.length === 0) {
      console.log("No organizations found for user");
      return [];
    }

    const orgIds = userOrgs.map(
      (uo: { organization_id: string }) => uo.organization_id,
    );
    console.log("📋 Organization IDs to fetch:", orgIds.length, "IDs");

    // Fetch the actual organizations
    const { data, error } = await supabase
      .from("organizations")
      .select("*")
      .in("id", orgIds)
      .is("deleted_at", null)
      .order("order_index");

    if (error) {
      console.error("Error fetching organizations:", error);
      throw error;
    }

    console.log("📊 Organizations fetched:", {
      count: data?.length,
      firstOrg: data?.[0]?.name,
    });

    return data || [];
  }

  async getOrganization(id: string) {
    const supabase = this.supabase;
    const { data, error } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    return data;
  }

  private normalizeOrganizationFields(input: OrganizationInput) {
    const payload: Record<string, unknown> = {};
    if (input.name !== undefined) payload.name = String(input.name).trim();
    if (input.color !== undefined) payload.color = input.color;
    if (input.description !== undefined)
      payload.description = input.description;
    if (input.archived !== undefined) payload.archived = input.archived;
    if (input.order !== undefined) payload.order_index = input.order;
    if (input.order_index !== undefined)
      payload.order_index = input.order_index;
    return payload;
  }

  private async syncOrganizationMembers(
    organizationId: string,
    memberIds?: string[],
    ownerId?: string | null,
  ) {
    const admin = getAdminClient();
    const { data: existingMemberships, error: existingMembershipsError } =
      await admin
        .from("user_organizations")
        .select("user_id,is_owner")
        .eq("organization_id", organizationId);

    if (existingMembershipsError) {
      throw existingMembershipsError;
    }

    const existingRows = (existingMemberships ||
      []) as OrganizationMembershipRow[];
    const existingOwnerIds = existingRows
      .filter((row) => Boolean(row.is_owner))
      .map((row) => row.user_id);

    const nextOwnerIds = ownerId
      ? [ownerId]
      : existingOwnerIds.length > 0
        ? existingOwnerIds
        : [this.userId];

    const nextMemberIds = new Set<string>([
      ...(Array.isArray(memberIds) ? memberIds : []),
      ...nextOwnerIds,
    ]);

    const desiredRows = Array.from(nextMemberIds).map((userId) => ({
      user_id: userId,
      organization_id: organizationId,
      is_owner: nextOwnerIds.includes(userId),
    }));

    if (desiredRows.length > 0) {
      const { error: upsertError } = await admin
        .from("user_organizations")
        .upsert(desiredRows, { onConflict: "user_id,organization_id" });

      if (upsertError) {
        throw upsertError;
      }
    }

    const removableUserIds = existingRows
      .map((row) => row.user_id)
      .filter((userId) => !nextMemberIds.has(userId));

    if (removableUserIds.length > 0) {
      const { error: deleteError } = await admin
        .from("user_organizations")
        .delete()
        .eq("organization_id", organizationId)
        .in("user_id", removableUserIds);

      if (deleteError) {
        throw deleteError;
      }
    }
  }

  async createOrganization(org: any) {
    const supabase = this.supabase;
    const organizationFields = this.normalizeOrganizationFields(org);
    const { data, error } = await supabase
      .from("organizations")
      .insert({
        ...organizationFields,
        archived: organizationFields.archived ?? false,
        order_index: organizationFields.order_index ?? 0,
      })
      .select()
      .single();

    if (error) throw error;
    await this.syncOrganizationMembers(
      data.id,
      Array.isArray(org?.memberIds) ? org.memberIds : [this.userId],
      org?.ownerId || this.userId,
    );
    return data;
  }

  async updateOrganization(id: string, updates: any) {
    const supabase = this.supabase;
    const organizationFields = this.normalizeOrganizationFields(updates || {});
    let data: any = null;

    if (Object.keys(organizationFields).length > 0) {
      const response = await supabase
        .from("organizations")
        .update(organizationFields)
        .eq("id", id)
        .select()
        .single();

      if (response.error) throw response.error;
      data = response.data;
    } else {
      data = await this.getOrganization(id);
    }

    if (updates?.memberIds !== undefined || updates?.ownerId !== undefined) {
      await this.syncOrganizationMembers(
        id,
        updates?.memberIds,
        updates?.ownerId,
      );
    }

    return data;
  }

  async deleteOrganization(id: string) {
    return this.softDeleteEntity("organization", id);
  }

  async deleteGoal(id: string) {
    return this.softDeleteEntity("goal", id);
  }

  // --- Versioning: soft delete / restore / purge / trash / history ---

  async softDeleteEntity(
    entityType: "organization" | "project" | "section" | "goal" | "task",
    id: string,
  ): Promise<{ batchId: string }> {
    const supabase = this.supabase;
    const { data, error } = await supabase.rpc("soft_delete_entity", {
      p_entity_type: entityType,
      p_entity_id: id,
    });

    if (error) throw error;
    return { batchId: data };
  }

  /**
   * Best-effort append to public.audit_logs via this adapter's authed,
   * RLS-scoped client. Never throws — an audit failure must not break the
   * caller's primary (already-completed) action. Defaults the actor to the
   * adapter's authed user when not supplied.
   */
  async writeAuditLog(
    entry: Omit<AuditLogEntry, "actorUserId"> & {
      actorUserId?: string | null;
    },
  ): Promise<void> {
    await writeAuditLogEntry(this.supabase, {
      ...entry,
      actorUserId:
        entry.actorUserId === undefined
          ? this.userId
          : entry.actorUserId,
    });
  }

  async restoreEntity(batchId: string): Promise<{ restored: number }> {
    const supabase = this.supabase;
    const { data, error } = await supabase.rpc("restore_entity", {
      p_batch_id: batchId,
    });

    if (error) throw error;
    return { restored: data };
  }

  async purgeEntity(
    entityType: "organization" | "project" | "section" | "goal" | "task",
    id: string,
  ) {
    const table = `${entityType === "organization" ? "organization" : entityType}s`;
    const supabase = this.supabase;
    const { error } = await supabase.from(table).delete().eq("id", id);

    if (error) throw error;
  }

  async getTrash() {
    const supabase = this.supabase;
    const [orgs, projects, sections, goals, tasks] = await Promise.all(
      ["organizations", "projects", "sections", "goals", "tasks"].map(
        async (table) => {
          const { data, error } = await supabase
            .from(table)
            .select("*")
            .not("deleted_at", "is", null)
            .order("deleted_at", { ascending: false });
          if (error) throw error;
          return data || [];
        },
      ),
    );

    return {
      organizations: orgs,
      projects,
      sections,
      goals,
      tasks,
    };
  }

  async getEntityHistory(entityType: string, entityId: string) {
    const supabase = this.supabase;
    const { data, error } = await supabase
      .from("entity_events")
      .select("*")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("occurred_at", { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async getScopeHistory(scope: {
    organizationId?: string;
    projectId?: string;
  }) {
    const supabase = this.supabase;
    let query = supabase
      .from("entity_events")
      .select("*")
      .order("occurred_at", { ascending: true })
      .limit(5000);

    if (scope.projectId) {
      query = query.eq("project_id", scope.projectId);
    } else if (scope.organizationId) {
      query = query.eq("organization_id", scope.organizationId);
    } else {
      throw new Error("organizationId or projectId required");
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  // Projects
  private normalizeProjectFields(input: ProjectInput) {
    const payload: Record<string, unknown> = {};
    if (input.name !== undefined) payload.name = String(input.name).trim();
    if (input.color !== undefined) payload.color = input.color;
    if (input.description !== undefined)
      payload.description = input.description;
    if (input.devnotesMeta !== undefined)
      payload.devnotes_meta = input.devnotesMeta;
    if (input.devnotes_meta !== undefined)
      payload.devnotes_meta = input.devnotes_meta;
    if (input.archived !== undefined) payload.archived = input.archived;
    if (input.budget !== undefined) payload.budget = input.budget;
    if (input.deadline !== undefined) payload.deadline = input.deadline;
    if (input.isFavorite !== undefined) payload.is_favorite = input.isFavorite;
    if (input.is_favorite !== undefined)
      payload.is_favorite = input.is_favorite;
    if (input.organizationId !== undefined)
      payload.organization_id = input.organizationId;
    if (input.organization_id !== undefined)
      payload.organization_id = input.organization_id;
    if (input.order !== undefined) payload.order_index = input.order;
    if (input.order_index !== undefined)
      payload.order_index = input.order_index;
    if (input.todoistId !== undefined) payload.todoist_id = input.todoistId;
    if (input.todoist_id !== undefined) payload.todoist_id = input.todoist_id;
    return payload;
  }

  private async syncProjectMembers(
    projectId: string,
    memberIds?: string[],
    ownerId?: string | null,
  ) {
    const admin = getAdminClient();
    const { data: existingMemberships, error: existingMembershipsError } =
      await admin
        .from("user_projects")
        .select("user_id,is_owner")
        .eq("project_id", projectId);

    if (existingMembershipsError) {
      throw existingMembershipsError;
    }

    const existingRows = (existingMemberships || []) as ProjectMembershipRow[];
    const existingOwnerIds = existingRows
      .filter((row) => Boolean(row.is_owner))
      .map((row) => row.user_id);

    const nextOwnerIds = ownerId
      ? [ownerId]
      : existingOwnerIds.length > 0
        ? existingOwnerIds
        : [this.userId];

    const nextMemberIds = new Set<string>([
      ...(Array.isArray(memberIds) ? memberIds : []),
      ...nextOwnerIds,
    ]);

    const desiredRows = Array.from(nextMemberIds).map((userId) => ({
      user_id: userId,
      project_id: projectId,
      is_owner: nextOwnerIds.includes(userId),
    }));

    if (desiredRows.length > 0) {
      const { error: upsertError } = await admin
        .from("user_projects")
        .upsert(desiredRows, { onConflict: "user_id,project_id" });

      if (upsertError) {
        throw upsertError;
      }
    }

    const removableUserIds = existingRows
      .map((row) => row.user_id)
      .filter((userId) => !nextMemberIds.has(userId));

    if (removableUserIds.length > 0) {
      const { error: deleteError } = await admin
        .from("user_projects")
        .delete()
        .eq("project_id", projectId)
        .in("user_id", removableUserIds);

      if (deleteError) {
        throw deleteError;
      }
    }
  }

  // Map snake_case DB columns to the camelCase fields the frontend `Project`
  // type expects (mirrors the mapping getTasks() applies to task rows). The
  // raw snake_case fields are kept via the spread for backward compatibility.
  private mapProjectRow(project: any) {
    return {
      ...project,
      organizationId: project.organization_id,
      parentId: project.parent_id ?? null,
      isFavorite: project.is_favorite ?? false,
      devnotesMeta: project.devnotes_meta ?? null,
      orderIndex: project.order_index,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
      todoistId: project.todoist_id,
    };
  }

  async getProjects(organizationId?: string) {
    // Memoize the (common) no-arg call for the lifetime of this adapter
    // instance so getTasks()'s repeated getProjects() calls don't refetch.
    if (!organizationId) {
      if (!this._projectsPromise) {
        this._projectsPromise = this._getProjects().catch((error) => {
          this._projectsPromise = null;
          throw error;
        });
      }
      return this._projectsPromise;
    }
    return this._getProjects(organizationId);
  }

  private async _getProjects(organizationId?: string) {
    const supabase = this.supabase;
    let orgMembershipsRaw: Array<{
      organization_id: string;
      is_owner: boolean | null;
    }>;
    let explicitProjectIds: string[];
    try {
      [orgMembershipsRaw, explicitProjectIds] = await Promise.all([
        this.getOrgMemberships(),
        this.getUserProjectIds(),
      ]);
    } catch (error) {
      console.error("Error fetching membership scope for projects:", error);
      return [];
    }

    let explicitProjects: ProjectScopeRow[] = [];
    if (explicitProjectIds.length > 0) {
      const { data: explicitProjectRows, error: explicitProjectsError } =
        await supabase
          .from("projects")
          .select("id,organization_id")
          .in("id", explicitProjectIds);

      if (explicitProjectsError) {
        console.error(
          "Error fetching explicit project scope rows:",
          explicitProjectsError,
        );
        return [];
      }

      explicitProjects = (explicitProjectRows || []) as ProjectScopeRow[];
    }

    const {
      fullyVisibleOrganizationIds,
      explicitProjectIds: explicitlyVisibleIds,
    } = resolveVisibleProjectIds({
      orgMemberships: (orgMembershipsRaw || []) as UserOrganizationScopeRow[],
      explicitProjects,
    });

    if (organizationId) {
      if (fullyVisibleOrganizationIds.has(organizationId)) {
        const { data, error } = await supabase
          .from("projects")
          .select("*")
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .order("order_index");

        if (error) throw error;
        return (data || []).map((row: any) => this.mapProjectRow(row));
      }

      const visibleIdsInOrganization = explicitProjects
        .filter((project) => project.organization_id === organizationId)
        .map((project) => project.id);

      if (visibleIdsInOrganization.length === 0) {
        return [];
      }

      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .in("id", visibleIdsInOrganization)
        .is("deleted_at", null)
        .order("order_index");

      if (error) throw error;
      return (data || []).map((row: any) => this.mapProjectRow(row));
    }

    const scopedOrganizationIds = Array.from(
      new Set([
        ...Array.from(fullyVisibleOrganizationIds),
        ...explicitProjects.map((project) => project.organization_id),
      ]),
    );

    if (scopedOrganizationIds.length === 0) {
      return [];
    }

    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .in("organization_id", scopedOrganizationIds)
      .is("deleted_at", null)
      .order("order_index");

    if (error) throw error;

    const filteredProjects = (data || []).filter((project: any) => {
      const projectOrganizationId = project.organization_id;
      return (
        fullyVisibleOrganizationIds.has(projectOrganizationId) ||
        explicitlyVisibleIds.has(project.id)
      );
    });

    console.log("✅ Projects fetched:", filteredProjects.length);
    return filteredProjects.map((row: any) => this.mapProjectRow(row));
  }

  async getProject(id: string) {
    const supabase = this.supabase;
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    return data;
  }

  async createProject(project: any) {
    const supabase = this.supabase;
    const normalizedProject = this.normalizeProjectFields(project ?? {});
    const payload = {
      ...normalizedProject,
      name: String(normalizedProject.name || "").trim(),
      color: normalizedProject.color ?? "#6B7280",
      organization_id:
        normalizedProject.organization_id ??
        project?.organization_id ??
        project?.organizationId,
      is_favorite:
        normalizedProject.is_favorite ??
        project?.is_favorite ??
        project?.isFavorite ??
        false,
      archived: normalizedProject.archived ?? project?.archived ?? false,
      budget: normalizedProject.budget ?? project?.budget ?? null,
      deadline: normalizedProject.deadline ?? project?.deadline ?? null,
      order_index:
        normalizedProject.order_index ??
        project?.order_index ??
        project?.orderIndex ??
        0,
      todoist_id:
        normalizedProject.todoist_id ??
        project?.todoist_id ??
        project?.todoistId ??
        null,
    };

    if (!payload.name) {
      throw new Error("Project name is required");
    }

    if (!payload.organization_id) {
      throw new Error("organization_id is required");
    }

    const { data, error } = await supabase
      .from("projects")
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    await this.syncProjectMembers(
      data.id,
      Array.isArray(project?.memberIds) ? project.memberIds : [this.userId],
      project?.ownerId || this.userId,
    );
    return data;
  }

  async updateProject(id: string, updates: any) {
    const supabase = this.supabase;
    const projectFields = this.normalizeProjectFields(updates || {});
    let data: any = null;

    if (Object.keys(projectFields).length > 0) {
      const response = await supabase
        .from("projects")
        .update(projectFields)
        .eq("id", id)
        .select()
        .single();

      if (response.error) throw response.error;
      data = response.data;
    } else {
      data = await this.getProject(id);
    }

    if (updates?.memberIds !== undefined || updates?.ownerId !== undefined) {
      await this.syncProjectMembers(id, updates?.memberIds, updates?.ownerId);
    }

    return data;
  }

  async deleteProject(id: string) {
    return this.softDeleteEntity("project", id);
  }

  // Tasks
  async getTasks(projectId?: string) {
    const supabase = this.supabase;

    // If fetching for a specific project, first verify user has access
    if (projectId) {
      const projects = await this.getProjects();
      const hasAccess = projects.some(
        (p: { id: string }) => p.id === projectId,
      );
      if (!hasAccess) {
        return [];
      }
    }

    console.log("📋 Fetching tasks for user:", this.userId);
    const projects = projectId ? [] : await this.getProjects();
    const userProjectIds = projects.map((p: { id: string }) => p.id);
    const pageSize = 1000;
    let offset = 0;
    let allTasks: any[] = [];

    while (true) {
      let query = supabase
        .from("tasks")
        .select(
          `
          *,
          tags:task_tags(tag:tags(*)),
          reminders(*),
          attachments(*),
          assignee:profiles!tasks_assigned_to_fkey(id, first_name, last_name, email, profile_color, profile_memoji),
          creator:profiles!tasks_created_by_fkey(id, first_name, last_name, email)
        `,
        )
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (projectId) {
        query = query.eq("project_id", projectId);
      } else if (userProjectIds.length > 0) {
        query = query.or(
          `assigned_to.eq.${this.userId},and(assigned_to.is.null,project_id.in.(${userProjectIds.join(",")}))`,
        );
      } else {
        query = query.eq("assigned_to", this.userId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const batch = data || [];
      allTasks = allTasks.concat(batch);

      if (batch.length < pageSize) {
        break;
      }
      offset += pageSize;
    }

    console.log("✅ Tasks fetched:", allTasks.length);

    // Transform the data to match the expected format
    return allTasks.map((task: any) => {
      // Construct assignee info from joined profile data
      let assigneeName: string | null = null;
      let assigneeColor: string | null = null;
      let assigneeInitial: string | null = null;
      let assigneeMemoji: string | null = null;
      if (task.assignee) {
        const firstName = task.assignee.first_name || "";
        const lastName = task.assignee.last_name || "";
        assigneeName =
          `${firstName} ${lastName}`.trim() || task.assignee.email || null;
        assigneeColor = task.assignee.profile_color || null;
        assigneeInitial = firstName
          ? firstName.charAt(0).toUpperCase()
          : task.assignee.email
            ? task.assignee.email.charAt(0).toUpperCase()
            : null;
        assigneeMemoji = task.assignee.profile_memoji || null;
      }

      let creatorName: string | null = null;
      if (task.creator) {
        const firstName = task.creator.first_name || "";
        const lastName = task.creator.last_name || "";
        creatorName =
          `${firstName} ${lastName}`.trim() || task.creator.email || null;
      }

      return {
        ...task,
        // Map snake_case to camelCase for frontend compatibility
        devnotesMeta: task.devnotes_meta,
        requiresHitl: task.requires_hitl ?? false,
        projectId: task.project_id,
        dueDate: task.due_date,
        dueTime: task.due_time,
        parentId: task.parent_id,
        sectionId: task.section_id,
        goalId: task.goal_id,
        assignedTo: task.assigned_to,
        assignedToName: assigneeName,
        assignedToColor: assigneeColor,
        assignedToInitial: assigneeInitial,
        assignedToMemoji: assigneeMemoji,
        createdBy: task.created_by,
        createdByName: creatorName,
        completedAt: task.completed_at,
        createdAt: task.created_at,
        updatedAt: task.updated_at,
        todoistId: task.todoist_id,
        recurringPattern: task.recurring_pattern,
        orderIndex: task.order_index,
        timeEstimate: task.time_estimate,
        snoozedUntil: task.snoozed_until,
        startDate: task.start_date,
        startTime: task.start_time,
        endDate: task.end_date,
        endTime: task.end_time,
        tags: task.tags?.map((t: any) => t.tag.id) || [],
        tagBadges:
          task.tags
            ?.map((t: any) => t.tag)
            .filter(
              (tag: any) =>
                tag &&
                typeof tag.id === "string" &&
                typeof tag.name === "string",
            ) || [],
        reminders: task.reminders || [],
        attachments: task.attachments || [],
        files: task.attachments || [], // Compatibility with file-based system
      };
    });
  }

  async getTask(id: string) {
    const supabase = this.supabase;
    const { data, error } = await supabase
      .from("tasks")
      .select(
        `
        *,
        tags:task_tags(tag:tags(*)),
        reminders(*),
        attachments(*),
        assignee:profiles!tasks_assigned_to_fkey(id, first_name, last_name, email, profile_color, profile_memoji),
        creator:profiles!tasks_created_by_fkey(id, first_name, last_name, email)
      `,
      )
      .eq("id", id)
      .single();

    if (error) throw error;

    // Construct assignee info from joined profile data
    let assigneeName: string | null = null;
    let assigneeColor: string | null = null;
    let assigneeInitial: string | null = null;
    let assigneeMemoji: string | null = null;
    if (data.assignee) {
      const firstName = data.assignee.first_name || "";
      const lastName = data.assignee.last_name || "";
      assigneeName =
        `${firstName} ${lastName}`.trim() || data.assignee.email || null;
      assigneeColor = data.assignee.profile_color || null;
      assigneeInitial = firstName
        ? firstName.charAt(0).toUpperCase()
        : data.assignee.email
          ? data.assignee.email.charAt(0).toUpperCase()
          : null;
      assigneeMemoji = data.assignee.profile_memoji || null;
    }

    let creatorName: string | null = null;
    if (data.creator) {
      const firstName = data.creator.first_name || "";
      const lastName = data.creator.last_name || "";
      creatorName =
        `${firstName} ${lastName}`.trim() || data.creator.email || null;
    }

    // Transform the data to match the expected format
    return {
      ...data,
      // Map snake_case to camelCase for frontend compatibility
      devnotesMeta: data.devnotes_meta,
      requiresHitl: data.requires_hitl ?? false,
      projectId: data.project_id,
      dueDate: data.due_date,
      dueTime: data.due_time,
      parentId: data.parent_id,
      sectionId: data.section_id,
      goalId: data.goal_id,
      assignedTo: data.assigned_to,
      assignedToName: assigneeName,
      assignedToColor: assigneeColor,
      assignedToInitial: assigneeInitial,
      assignedToMemoji: assigneeMemoji,
      createdBy: data.created_by,
      createdByName: creatorName,
      completedAt: data.completed_at,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      todoistId: data.todoist_id,
      recurringPattern: data.recurring_pattern,
      orderIndex: data.order_index,
      timeEstimate: data.time_estimate,
      snoozedUntil: data.snoozed_until,
      startDate: data.start_date,
      startTime: data.start_time,
      endDate: data.end_date,
      endTime: data.end_time,
      tags: data.tags?.map((t: any) => t.tag.id) || [],
      tagBadges:
        data.tags
          ?.map((t: any) => t.tag)
          .filter(
            (tag: any) =>
              tag && typeof tag.id === "string" && typeof tag.name === "string",
          ) || [],
      reminders: data.reminders || [],
      attachments: data.attachments || [],
      files: data.attachments || [],
    };
  }

  async createTask(task: any) {
    const supabase = this.supabase;
    // Extract relational fields handled separately
    const { tags, reminders, attachments, files, ...rawTaskData } = task;
    const normalizedTaskContent = normalizeTaskContentFields({
      description:
        rawTaskData.description === undefined
          ? undefined
          : rawTaskData.description,
      devnotesMeta:
        rawTaskData.devnotesMeta === undefined
          ? undefined
          : rawTaskData.devnotesMeta,
      devnotes_meta:
        rawTaskData.devnotes_meta === undefined
          ? undefined
          : rawTaskData.devnotes_meta,
    });
    if (rawTaskData.description !== undefined) {
      rawTaskData.description = normalizedTaskContent.description;
    }
    if (
      rawTaskData.devnotesMeta !== undefined ||
      rawTaskData.devnotes_meta !== undefined ||
      normalizedTaskContent.devnotesMeta
    ) {
      rawTaskData.devnotes_meta = normalizedTaskContent.devnotesMeta;
      delete rawTaskData.devnotesMeta;
    }

    // Only these columns exist on the tasks table
    const allowedColumns = new Set([
      "name",
      "created_by",
      "description",
      "devnotes_meta",
      "requires_hitl",
      "due_date",
      "due_time",
      "priority",
      "deadline",
      "project_id",
      "assigned_to",
      "completed",
      "completed_at",
      "todoist_id",
      "recurring_pattern",
      "is_recurring",
      "parent_id",
      "indent",
      "section_id",
      "goal_id",
      "created_at",
      "updated_at",
      "todoist_assignee_id",
      "todoist_assigner_id",
      "todoist_child_order",
      "todoist_collapsed",
      "todoist_comment_count",
      "todoist_duration_amount",
      "todoist_duration_unit",
      "todoist_labels",
      "todoist_order",
      "todoist_sync_token",
      "todoist_url",
      "last_todoist_sync",
      "time_estimate",
      "snoozed_until",
      "start_date",
      "start_time",
      "end_date",
      "end_time",
    ]);

    // Map camelCase fields to snake_case for Supabase
    const fieldMap: Record<string, string> = {
      devnotesMeta: "devnotes_meta",
      requiresHitl: "requires_hitl",
      projectId: "project_id",
      dueDate: "due_date",
      dueTime: "due_time",
      parentId: "parent_id",
      assignedTo: "assigned_to",
      createdBy: "created_by",
      completedAt: "completed_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
      todoistId: "todoist_id",
      recurringPattern: "recurring_pattern",
      isRecurring: "is_recurring",
      sectionId: "section_id",
      goalId: "goal_id",
      lastTodoistSync: "last_todoist_sync",
      todoistOrder: "todoist_order",
      todoistLabels: "todoist_labels",
      todoistAssigneeId: "todoist_assignee_id",
      todoistAssignerId: "todoist_assigner_id",
      todoistCommentCount: "todoist_comment_count",
      todoistUrl: "todoist_url",
      todoistSyncToken: "todoist_sync_token",
      timeEstimate: "time_estimate",
      snoozedUntil: "snoozed_until",
      startDate: "start_date",
      startTime: "start_time",
      endDate: "end_date",
      endTime: "end_time",
    };

    const taskData: Record<string, any> = {};
    for (const [key, val] of Object.entries(rawTaskData)) {
      if (val === undefined) continue;
      const column = fieldMap[key] || key;
      if (!allowedColumns.has(column)) continue;
      taskData[column] = val;
    }

    // Stamp the creator from the acting user when not explicitly provided so
    // every task records who created it (mobile API, PAT/agent, and web app).
    if (taskData.created_by == null && this.userId) {
      taskData.created_by = this.userId;
    }

    // Create the task
    const { data: newTask, error } = await supabase
      .from("tasks")
      .insert(taskData)
      .select()
      .single();

    if (error) throw error;

    // Add tags
    if (tags && tags.length > 0) {
      await supabase.from("task_tags").insert(
        tags.map((tagId: string) => ({
          task_id: newTask.id,
          tag_id: tagId,
        })),
      );
    }

    // Add reminders
    if (reminders && reminders.length > 0) {
      await supabase.from("reminders").insert(
        reminders.map((reminder: any) => ({
          ...reminder,
          task_id: newTask.id,
        })),
      );
    }

    // Add attachments
    if (attachments && attachments.length > 0) {
      await supabase.from("attachments").insert(
        attachments.map((attachment: any) => ({
          ...attachment,
          task_id: newTask.id,
        })),
      );
    }

    return this.getTask(newTask.id);
  }

  async updateTask(id: string, updates: any) {
    const supabase = this.supabase;
    const { tags, reminders, attachments, files, ...rawTaskData } = updates;
    const normalizedTaskContent = normalizeTaskContentFields({
      description:
        rawTaskData.description === undefined
          ? undefined
          : rawTaskData.description,
      devnotesMeta:
        rawTaskData.devnotesMeta === undefined
          ? undefined
          : rawTaskData.devnotesMeta,
      devnotes_meta:
        rawTaskData.devnotes_meta === undefined
          ? undefined
          : rawTaskData.devnotes_meta,
    });
    if (rawTaskData.description !== undefined) {
      rawTaskData.description = normalizedTaskContent.description;
    }
    if (
      rawTaskData.devnotesMeta !== undefined ||
      rawTaskData.devnotes_meta !== undefined ||
      normalizedTaskContent.devnotesMeta
    ) {
      rawTaskData.devnotes_meta = normalizedTaskContent.devnotesMeta;
      delete rawTaskData.devnotesMeta;
    }

    // Filter to only valid task columns
    const allowedColumns = new Set([
      "name",
      "description",
      "devnotes_meta",
      "requires_hitl",
      "due_date",
      "due_time",
      "priority",
      "deadline",
      "project_id",
      "assigned_to",
      "completed",
      "completed_at",
      "todoist_id",
      "recurring_pattern",
      "is_recurring",
      "parent_id",
      "indent",
      "section_id",
      "goal_id",
      "created_at",
      "updated_at",
      "todoist_assignee_id",
      "todoist_assigner_id",
      "todoist_child_order",
      "todoist_collapsed",
      "todoist_comment_count",
      "todoist_duration_amount",
      "todoist_duration_unit",
      "todoist_labels",
      "todoist_order",
      "todoist_sync_token",
      "todoist_url",
      "last_todoist_sync",
      "time_estimate",
      "snoozed_until",
      "start_date",
      "start_time",
      "end_date",
      "end_time",
    ]);

    const fieldMap: Record<string, string> = {
      devnotesMeta: "devnotes_meta",
      requiresHitl: "requires_hitl",
      projectId: "project_id",
      dueDate: "due_date",
      dueTime: "due_time",
      parentId: "parent_id",
      assignedTo: "assigned_to",
      completedAt: "completed_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
      todoistId: "todoist_id",
      recurringPattern: "recurring_pattern",
      isRecurring: "is_recurring",
      sectionId: "section_id",
      goalId: "goal_id",
      lastTodoistSync: "last_todoist_sync",
      todoistOrder: "todoist_order",
      todoistLabels: "todoist_labels",
      todoistAssigneeId: "todoist_assignee_id",
      todoistAssignerId: "todoist_assigner_id",
      todoistCommentCount: "todoist_comment_count",
      todoistUrl: "todoist_url",
      todoistSyncToken: "todoist_sync_token",
      timeEstimate: "time_estimate",
      snoozedUntil: "snoozed_until",
      startDate: "start_date",
      startTime: "start_time",
      endDate: "end_date",
      endTime: "end_time",
    };

    const taskData: Record<string, any> = {};
    for (const [key, val] of Object.entries(rawTaskData)) {
      if (val === undefined) continue;
      const column = fieldMap[key] || key;
      if (allowedColumns.has(column)) taskData[column] = val;
    }

    // Detect a not-completed -> completed transition so stakeholders get a
    // "task completed" email (threaded under the original "task created" one).
    // Checked before the write so we only fire on the actual transition.
    let justCompleted = false;
    if (taskData.completed === true) {
      const { data: prior } = await supabase
        .from("tasks")
        .select("completed")
        .eq("id", id)
        .maybeSingle();
      justCompleted = prior ? prior.completed !== true : false;
    }

    // Update the task
    if (Object.keys(taskData).length > 0) {
      const { error } = await supabase
        .from("tasks")
        .update(taskData)
        .eq("id", id);

      if (error) throw error;
    }

    if (justCompleted) {
      void (async () => {
        try {
          const { sendTaskCompletedNotification } = await import(
            "@/lib/task-notifications"
          );
          await sendTaskCompletedNotification({
            taskId: id,
            actorUserId: this.userId,
          });
        } catch (notifyError) {
          console.error("Failed to dispatch task completed notification", {
            taskId: id,
            error: notifyError,
          });
        }
      })();
    }

    // Update tags if provided
    if (tags !== undefined) {
      // Remove existing tags
      await supabase.from("task_tags").delete().eq("task_id", id);

      // Add new tags
      if (tags.length > 0) {
        await supabase.from("task_tags").insert(
          tags.map((tagId: string) => ({
            task_id: id,
            tag_id: tagId,
          })),
        );
      }
    }

    // Update reminders if provided
    if (reminders !== undefined) {
      // Remove existing reminders
      await supabase.from("reminders").delete().eq("task_id", id);

      // Add new reminders
      if (reminders.length > 0) {
        await supabase.from("reminders").insert(
          reminders.map((reminder: any) => ({
            ...reminder,
            task_id: id,
          })),
        );
      }
    }

    // Update attachments if provided
    if (attachments !== undefined) {
      // Remove existing attachments
      await supabase.from("attachments").delete().eq("task_id", id);

      // Add new attachments
      if (attachments.length > 0) {
        await supabase.from("attachments").insert(
          attachments.map((attachment: any) => ({
            ...attachment,
            task_id: id,
          })),
        );
      }
    }

    return this.getTask(id);
  }

  async deleteTask(id: string) {
    return this.softDeleteEntity("task", id);
  }

  // Tags
  async getTags() {
    const supabase = this.supabase;
    const { data, error } = await supabase
      .from("tags")
      .select("*")
      .order("name");

    if (error) throw error;
    return data || [];
  }

  async createTag(tag: any) {
    const supabase = this.supabase;
    const { data, error } = await supabase
      .from("tags")
      .insert(tag)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Users
  async getUser(id: string) {
    const supabase = this.supabase;
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;

    // Map to match file-based user structure
    return {
      id: data.id,
      email: data.email,
      firstName: data.first_name || "",
      lastName: data.last_name || "",
      name:
        data.display_name ||
        `${data.first_name || ""} ${data.last_name || ""}`.trim() ||
        data.email,
      profileColor: data.profile_color,
      profileMemoji: data.profile_memoji,
      animationsEnabled: data.animations_enabled,
      dockBadgeEnabled: data.dock_badge_enabled,
      aiModelChains: data.ai_model_chains,
      priorityColor: data.priority_color,
      emailDeleteUndoSeconds: data.email_delete_undo_seconds,
      dailyCapacityMinutes: data.daily_capacity_minutes,
      status: data.status || "active",
      invitedAt: data.invited_at || null,
      inviteToken: data.invite_token || null,
      inviteExpiresAt: data.invite_expires_at || null,
      role: data.role,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async updateUser(id: string, updates: any) {
    const supabase = this.supabase;

    // Map from file-based structure to Supabase structure
    const supabaseUpdates: any = {};
    if (updates.firstName !== undefined)
      supabaseUpdates.first_name = updates.firstName;
    if (updates.lastName !== undefined)
      supabaseUpdates.last_name = updates.lastName;
    if (updates.profileColor !== undefined)
      supabaseUpdates.profile_color = updates.profileColor;
    if (updates.profileMemoji !== undefined)
      supabaseUpdates.profile_memoji = updates.profileMemoji;
    if (updates.animationsEnabled !== undefined)
      supabaseUpdates.animations_enabled = updates.animationsEnabled;
    if (updates.dockBadgeEnabled !== undefined)
      supabaseUpdates.dock_badge_enabled = updates.dockBadgeEnabled;
    if (updates.aiModelChains !== undefined)
      supabaseUpdates.ai_model_chains = updates.aiModelChains;
    if (updates.priorityColor !== undefined)
      supabaseUpdates.priority_color = updates.priorityColor;
    if (updates.emailDeleteUndoSeconds !== undefined)
      supabaseUpdates.email_delete_undo_seconds =
        updates.emailDeleteUndoSeconds;
    if (updates.dailyCapacityMinutes !== undefined)
      supabaseUpdates.daily_capacity_minutes = updates.dailyCapacityMinutes;
    if (updates.role !== undefined) supabaseUpdates.role = updates.role;

    const { data, error } = await supabase
      .from("profiles")
      .update(supabaseUpdates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    // Map back to file-based structure
    return {
      id: data.id,
      email: data.email,
      firstName: data.first_name || "",
      lastName: data.last_name || "",
      profileColor: data.profile_color,
      profileMemoji: data.profile_memoji,
      animationsEnabled: data.animations_enabled,
      dockBadgeEnabled: data.dock_badge_enabled,
      aiModelChains: data.ai_model_chains,
      priorityColor: data.priority_color,
      emailDeleteUndoSeconds: data.email_delete_undo_seconds,
      dailyCapacityMinutes: data.daily_capacity_minutes,
      role: data.role,
    };
  }

  // Batch operations
  async batchUpdateTasks(updateItems: { id: string; updates: any }[]) {
    const results = [];

    for (const { id, updates } of updateItems) {
      try {
        const result = await this.updateTask(id, updates);
        results.push(result);
      } catch (error) {
        console.error(`Error updating task ${id}:`, error);
      }
    }

    return results;
  }

  // Time Blocks
  async getTimeBlocks(startDate?: string, endDate?: string) {
    const supabase = this.supabase;
    let query = supabase
      .from("time_blocks")
      .select(
        `
        *,
        time_block_tasks (
          task_id,
          tasks (*)
        )
      `,
      )
      .eq("user_id", this.userId)
      .order("start_time", { ascending: true });

    if (startDate) {
      query = query.gte("start_time", startDate);
    }
    if (endDate) {
      query = query.lte("start_time", endDate);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Transform the data to include tasks array
    return (data || []).map((block: any) => ({
      ...block,
      tasks:
        block.time_block_tasks?.map((tbt: any) => tbt.tasks).filter(Boolean) ||
        [],
    }));
  }

  async getTimeBlock(id: string) {
    const supabase = this.supabase;
    const { data, error } = await supabase
      .from("time_blocks")
      .select(
        `
        *,
        time_block_tasks (
          task_id,
          tasks (*)
        )
      `,
      )
      .eq("id", id)
      .single();

    if (error) throw error;

    return {
      ...data,
      tasks:
        data.time_block_tasks?.map((tbt: any) => tbt.tasks).filter(Boolean) ||
        [],
    };
  }

  async createTimeBlock(timeBlock: any) {
    const supabase = this.supabase;
    const { tasks, ...blockData } = timeBlock;

    // Create the time block
    const { data: blockResult, error: blockError } = await supabase
      .from("time_blocks")
      .insert({
        ...blockData,
        user_id: this.userId,
      })
      .select()
      .single();

    if (blockError) throw blockError;

    // Add task associations if provided
    if (tasks && tasks.length > 0) {
      const taskAssociations = tasks.map((taskId: string) => ({
        time_block_id: blockResult.id,
        task_id: taskId,
      }));

      const { error: assocError } = await supabase
        .from("time_block_tasks")
        .insert(taskAssociations);

      if (assocError) throw assocError;
    }

    return blockResult;
  }

  async updateTimeBlock(id: string, updates: any) {
    const supabase = this.supabase;
    const { tasks, ...blockUpdates } = updates;

    // Update the time block
    const { data: blockResult, error: blockError } = await supabase
      .from("time_blocks")
      .update(blockUpdates)
      .eq("id", id)
      .select()
      .single();

    if (blockError) throw blockError;

    // Update task associations if provided
    if (tasks !== undefined) {
      // Remove existing associations
      await supabase.from("time_block_tasks").delete().eq("time_block_id", id);

      // Add new associations
      if (tasks.length > 0) {
        const taskAssociations = tasks.map((taskId: string) => ({
          time_block_id: id,
          task_id: taskId,
        }));

        const { error: assocError } = await supabase
          .from("time_block_tasks")
          .insert(taskAssociations);

        if (assocError) throw assocError;
      }
    }

    return blockResult;
  }

  async deleteTimeBlock(id: string) {
    const supabase = this.supabase;
    const { error } = await supabase.from("time_blocks").delete().eq("id", id);

    if (error) throw error;
  }

  async addTaskToTimeBlock(timeBlockId: string, taskId: string) {
    const supabase = this.supabase;
    const { error } = await supabase.from("time_block_tasks").insert({
      time_block_id: timeBlockId,
      task_id: taskId,
    });

    if (error) throw error;
  }

  async removeTaskFromTimeBlock(timeBlockId: string, taskId: string) {
    const supabase = this.supabase;
    const { error } = await supabase
      .from("time_block_tasks")
      .delete()
      .eq("time_block_id", timeBlockId)
      .eq("task_id", taskId);

    if (error) throw error;
  }

  // ---------------------------------------------------------------------------
  // Domino Effect — stakes, edges, task links (Phase 3)
  // RLS scopes every read/write to the authed user's org access; we additionally
  // filter by organization_id / soft-delete to keep results tight.
  // ---------------------------------------------------------------------------

  async getStakes(organizationId: string) {
    const supabase = this.supabase;
    const { data, error } = await supabase
      .from("stakes")
      .select("*")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async getStakeById(id: string) {
    const supabase = this.supabase;
    const { data, error } = await supabase
      .from("stakes")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw error;
    return data || null;
  }

  async createStake(stake: any) {
    const supabase = this.supabase;
    const { data, error } = await supabase
      .from("stakes")
      .insert(stake)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateStake(id: string, updates: any) {
    const supabase = this.supabase;
    const { data, error } = await supabase
      .from("stakes")
      .update(updates)
      .eq("id", id)
      .is("deleted_at", null)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data || null;
  }

  async softDeleteStake(id: string) {
    const supabase = this.supabase;
    const { data, error } = await supabase
      .from("stakes")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data || null;
  }

  async getStakeEdges(organizationId: string) {
    const supabase = this.supabase;
    // Edge RLS mirrors the parent stake's org; constrain to the org's stakes.
    const { data: stakeRows, error: stakeError } = await supabase
      .from("stakes")
      .select("id")
      .eq("organization_id", organizationId)
      .is("deleted_at", null);

    if (stakeError) throw stakeError;
    const stakeIds = (stakeRows || []).map((row: { id: string }) => row.id);
    if (stakeIds.length === 0) return [];

    const { data, error } = await supabase
      .from("stake_edges")
      .select("*")
      .is("deleted_at", null)
      .in("parent_stake_id", stakeIds);

    if (error) throw error;
    return data || [];
  }

  async createStakeEdge(edge: {
    parent_stake_id: string;
    child_stake_id: string;
    weight_multiplier?: number;
  }) {
    const supabase = this.supabase;
    const { data, error } = await supabase
      .from("stake_edges")
      .insert(edge)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deleteStakeEdge(parentStakeId: string, childStakeId: string) {
    const supabase = this.supabase;
    const { data, error } = await supabase
      .from("stake_edges")
      .update({ deleted_at: new Date().toISOString() })
      .eq("parent_stake_id", parentStakeId)
      .eq("child_stake_id", childStakeId)
      .is("deleted_at", null)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data || null;
  }

  async getTaskStakeLinks(taskId: string) {
    const supabase = this.supabase;
    const { data, error } = await supabase
      .from("task_stakes")
      .select("*")
      .eq("task_id", taskId)
      .is("deleted_at", null);

    if (error) throw error;
    return data || [];
  }

  async linkTaskStake(link: {
    task_id: string;
    stake_id: string;
    resolution_type: "defuses_once" | "eliminates";
  }) {
    const supabase = this.supabase;
    // Re-link revives a previously soft-deleted row to respect the (task_id,
    // stake_id) PK; otherwise insert fresh.
    const { data, error } = await supabase
      .from("task_stakes")
      .upsert(
        {
          task_id: link.task_id,
          stake_id: link.stake_id,
          resolution_type: link.resolution_type,
          deleted_at: null,
        },
        { onConflict: "task_id,stake_id" },
      )
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async unlinkTaskStake(taskId: string, stakeId: string) {
    const supabase = this.supabase;
    const { data, error } = await supabase
      .from("task_stakes")
      .update({ deleted_at: new Date().toISOString() })
      .eq("task_id", taskId)
      .eq("stake_id", stakeId)
      .is("deleted_at", null)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data || null;
  }

  /**
   * Bundle everything computeTaskDominoScores needs for an org: active,
   * non-deleted stakes, their edges, every task↔stake link, and a
   * task_id → time_estimate (minutes) map for effort scaling.
   */
  async getDominoGraphData(organizationId: string) {
    const supabase = this.supabase;

    const stakes = await this.getStakes(organizationId);
    const edges = await this.getStakeEdges(organizationId);

    const stakeIds = (stakes || []).map((s: { id: string }) => s.id);

    let links: any[] = [];
    if (stakeIds.length > 0) {
      const { data: linkRows, error: linkError } = await supabase
        .from("task_stakes")
        .select("*")
        .is("deleted_at", null)
        .in("stake_id", stakeIds);

      if (linkError) throw linkError;
      links = linkRows || [];
    }

    const taskEffortMinutes: Record<string, number> = {};
    const taskIds = Array.from(
      new Set(
        links
          .map((l: { task_id: string }) => l.task_id)
          .filter((id: any) => typeof id === "string" && id),
      ),
    ) as string[];

    if (taskIds.length > 0) {
      const { data: taskRows, error: taskError } = await supabase
        .from("tasks")
        .select("id, time_estimate")
        .in("id", taskIds)
        .is("deleted_at", null);

      if (taskError) throw taskError;
      for (const row of taskRows || []) {
        if (typeof row.time_estimate === "number") {
          taskEffortMinutes[String(row.id)] = row.time_estimate;
        }
      }
    }

    return { stakes, edges, links, taskEffortMinutes };
  }
}
