/**
 * Multi-organization project ownership helpers.
 *
 * A project has ONE primary owner (`projects.organization_id`, unchanged) plus
 * any number of additional organizations listed in `project_organizations`
 * (that table also carries a trigger-synced `is_primary` row mirroring the
 * primary owner). A user can see/work in a project when they belong to ANY of
 * its organizations (or hold an explicit `user_projects` membership).
 *
 * These helpers are for code that runs with the SERVICE-ROLE client (which
 * bypasses RLS) and therefore must make the authorization decision itself.
 * Anything that goes through the user-scoped client is already covered by the
 * RLS policies (see supabase/migrations/20261028000*).
 *
 * Every helper degrades to the legacy single-org answer if the
 * `project_organizations` table does not exist yet (app deployed before the
 * migration), so rollout order cannot lock anybody out or leak anything.
 */

export type ProjectOrgRole = "manager" | "member";

export interface ProjectOrgLink {
  organizationId: string;
  role: ProjectOrgRole;
  isPrimary: boolean;
}

/** PostgREST / Postgres errors that mean "project_organizations is not there (yet)". */
export function isMissingProjectOrganizations(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string; details?: string };
  if (e.code === "42P01" || e.code === "PGRST200" || e.code === "PGRST205") {
    return true;
  }
  const text = `${e.message ?? ""} ${e.details ?? ""}`;
  return /project_organizations/.test(text) && /(does not exist|relationship|schema cache|could not find)/i.test(text);
}

/** PostgREST embed fragment that returns a project's org links with the row. */
export const PROJECT_ORG_EMBED = "project_organizations(organization_id,role,is_primary)";

/**
 * Normalizes a raw `projects` row (optionally carrying the embedded
 * `project_organizations` array) into the full, de-duplicated list of owning
 * org ids, PRIMARY FIRST. Always includes `organization_id` so a legacy row
 * without embedded links still resolves to its one org.
 */
export function projectOrgIdsFromRow(row: {
  organization_id?: string | null;
  project_organizations?: Array<{ organization_id: string; is_primary?: boolean | null }> | null;
}): string[] {
  const ids: string[] = [];
  const push = (id: string | null | undefined) => {
    if (id && !ids.includes(id)) ids.push(id);
  };
  push(row.organization_id);
  for (const link of row.project_organizations ?? []) {
    if (link.is_primary) push(link.organization_id);
  }
  for (const link of row.project_organizations ?? []) push(link.organization_id);
  return ids;
}

export function projectOrgLinksFromRow(row: {
  organization_id?: string | null;
  project_organizations?: Array<{
    organization_id: string;
    role?: string | null;
    is_primary?: boolean | null;
  }> | null;
}): ProjectOrgLink[] {
  const links: ProjectOrgLink[] = [];
  const seen = new Set<string>();
  for (const id of projectOrgIdsFromRow(row)) {
    const raw = (row.project_organizations ?? []).find((l) => l.organization_id === id);
    seen.add(id);
    links.push({
      organizationId: id,
      role: raw?.role === "member" ? "member" : "manager",
      isPrimary: id === row.organization_id,
    });
  }
  return links;
}

/** True when any org in `projectOrgIds` is one the user belongs to. */
export function isMemberOfAnyProjectOrg(
  userOrgIds: Iterable<string>,
  projectOrgIds: Iterable<string>,
): boolean {
  const mine = new Set(userOrgIds);
  for (const id of projectOrgIds) if (mine.has(id)) return true;
  return false;
}

type Client = any; // supabase-js client (service role or scoped)

/** Org ids of one project, primary first. Falls back to the legacy column. */
export async function getProjectOrgIds(client: Client, projectId: string): Promise<string[]> {
  const { data, error } = await client
    .from("projects")
    .select(`organization_id, ${PROJECT_ORG_EMBED}`)
    .eq("id", projectId)
    .maybeSingle();
  if (error && isMissingProjectOrganizations(error)) {
    const legacy = await client
      .from("projects")
      .select("organization_id")
      .eq("id", projectId)
      .maybeSingle();
    return legacy.data ? projectOrgIdsFromRow(legacy.data) : [];
  }
  if (error || !data) return [];
  return projectOrgIdsFromRow(data);
}

/** Org ids for many projects (chunked: PostgREST URLs have a length limit). */
export async function getProjectOrgIdsMap(
  client: Client,
  projectIds: string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const unique = Array.from(new Set(projectIds.filter(Boolean)));
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    let res = await client
      .from("projects")
      .select(`id, organization_id, ${PROJECT_ORG_EMBED}`)
      .in("id", chunk);
    if (res.error && isMissingProjectOrganizations(res.error)) {
      res = await client.from("projects").select("id, organization_id").in("id", chunk);
    }
    if (res.error) throw res.error;
    for (const row of res.data ?? []) out.set(row.id, projectOrgIdsFromRow(row));
  }
  return out;
}

/** Org ids the user belongs to. */
export async function getUserOrgIds(client: Client, userId: string): Promise<string[]> {
  const { data, error } = await client
    .from("user_organizations")
    .select("organization_id")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map((r: { organization_id: string }) => r.organization_id);
}

/**
 * Service-role authorization: may `userId` see/work in `projectId`?
 * True when the user belongs to ANY org of the project, holds an explicit
 * `user_projects` membership, or is a super admin (same rule as the RLS helper
 * user_has_project_org_access plus explicit membership).
 */
export async function userCanAccessProject(
  client: Client,
  userId: string,
  projectId: string,
): Promise<boolean> {
  const [projectOrgIds, userOrgIds] = await Promise.all([
    getProjectOrgIds(client, projectId),
    getUserOrgIds(client, userId),
  ]);
  if (projectOrgIds.length === 0) return false;
  if (isMemberOfAnyProjectOrg(userOrgIds, projectOrgIds)) return true;
  const { data: membership } = await client
    .from("user_projects")
    .select("project_id")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (membership) return true;
  const { data: profile } = await client
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  return profile?.role === "super_admin";
}

/**
 * Replaces the ADDITIONAL (non-primary) organizations of a project with
 * `organizationIds` (the primary is never touched and is ignored if present).
 * Service-role only; callers MUST have verified the actor is an admin of the
 * project's primary org. New links get `role` (default 'manager' = full access).
 */
export async function setProjectSharedOrganizations(
  admin: Client,
  args: {
    projectId: string;
    organizationIds: string[];
    role?: ProjectOrgRole;
    actorUserId?: string | null;
  },
): Promise<{ added: string[]; removed: string[] }> {
  const { projectId, role = "manager", actorUserId = null } = args;
  const { data: project, error: projectError } = await admin
    .from("projects")
    .select("organization_id")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) throw projectError;
  if (!project?.organization_id) throw new Error("Project not found");
  const primary: string = project.organization_id;

  const desired = new Set(args.organizationIds.filter((id) => id && id !== primary));
  const { data: existingRows, error: existingError } = await admin
    .from("project_organizations")
    .select("organization_id")
    .eq("project_id", projectId)
    .eq("is_primary", false);
  if (existingError) throw existingError;
  const existing = new Set<string>(
    (existingRows ?? []).map((r: { organization_id: string }) => r.organization_id),
  );

  const added = Array.from(desired).filter((id) => !existing.has(id));
  const removed = Array.from(existing).filter((id) => !desired.has(id));

  if (added.length > 0) {
    const { error } = await admin.from("project_organizations").insert(
      added.map((organization_id) => ({
        project_id: projectId,
        organization_id,
        role,
        is_primary: false,
        added_by: actorUserId,
      })),
    );
    if (error) throw error;
  }
  if (removed.length > 0) {
    const { error } = await admin
      .from("project_organizations")
      .delete()
      .eq("project_id", projectId)
      .eq("is_primary", false)
      .in("organization_id", removed);
    if (error) throw error;
  }
  return { added, removed };
}

/**
 * True when `userId` may administer `projectId`: a global admin/super_admin,
 * owner of the PRIMARY org, or owner of an additional org whose link role is
 * 'manager'. Mirrors the SQL helper is_project_org_admin.
 */
export async function isProjectAdmin(
  client: Client,
  userId: string,
  projectId: string,
): Promise<{ authorized: boolean; primaryOrganizationId: string | null; isPrimaryAdmin: boolean }> {
  const { data: project, error } = await client
    .from("projects")
    .select(`organization_id, ${PROJECT_ORG_EMBED}`)
    .eq("id", projectId)
    .maybeSingle();
  let row = project;
  if (error && isMissingProjectOrganizations(error)) {
    row = (await client.from("projects").select("organization_id").eq("id", projectId).maybeSingle()).data;
  } else if (error) {
    row = null;
  }
  if (!row?.organization_id) {
    return { authorized: false, primaryOrganizationId: null, isPrimaryAdmin: false };
  }
  const primary: string = row.organization_id;

  const { data: profile } = await client
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.role === "admin" || profile?.role === "super_admin") {
    return { authorized: true, primaryOrganizationId: primary, isPrimaryAdmin: true };
  }

  const links = projectOrgLinksFromRow(row);
  const { data: memberships } = await client
    .from("user_organizations")
    .select("organization_id,is_owner")
    .eq("user_id", userId)
    .in(
      "organization_id",
      links.map((l) => l.organizationId),
    );
  const owned = new Set<string>(
    (memberships ?? [])
      .filter((m: { is_owner: boolean | null }) => Boolean(m.is_owner))
      .map((m: { organization_id: string }) => m.organization_id),
  );
  const isPrimaryAdmin = owned.has(primary);
  const managerOfAdditional = links.some((l) => !l.isPrimary && l.role === "manager" && owned.has(l.organizationId));
  return {
    authorized: isPrimaryAdmin || managerOfAdditional,
    primaryOrganizationId: primary,
    isPrimaryAdmin,
  };
}
