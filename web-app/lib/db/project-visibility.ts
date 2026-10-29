/**
 * Service-role helpers for listing/authorizing projects under multi-org
 * ownership (see project-orgs.ts). Kept separate so each stays small.
 *
 * Every helper degrades to legacy single-org behavior when the
 * `project_organizations` table does not exist yet.
 */
import {
  PROJECT_ORG_EMBED,
  isMissingProjectOrganizations,
  isMemberOfAnyProjectOrg,
  projectOrgIdsFromRow,
  getProjectOrgIdsMap,
} from "./project-orgs";

type Client = any; // supabase-js client

const CHUNK = 100;

function chunk<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Ids of projects that are SHARED INTO any of `orgIds` (non-primary links).
 * Primary-owned projects are NOT returned (query them via organization_id).
 */
export async function getSharedProjectIdsForOrgs(
  client: Client,
  orgIds: string[],
): Promise<string[]> {
  const ids = new Set<string>();
  const unique = Array.from(new Set(orgIds.filter(Boolean)));
  for (const part of chunk(unique)) {
    const { data, error } = await client
      .from("project_organizations")
      .select("project_id")
      .in("organization_id", part)
      .eq("is_primary", false);
    if (error) {
      if (isMissingProjectOrganizations(error)) return [];
      throw error;
    }
    for (const row of data ?? []) ids.add(String(row.project_id));
  }
  return Array.from(ids);
}

/**
 * Lists projects owned by (primary) OR shared into any of `orgIds`.
 * `columns` should include `id` and `organization_id`. Each row also carries
 * `organization_ids` (every owning org, primary first). De-duplicated.
 */
export async function listProjectsForOrgs(
  client: Client,
  columns: string,
  orgIds: string[],
): Promise<any[]> {
  const unique = Array.from(new Set(orgIds.filter(Boolean)));
  if (unique.length === 0) return [];
  const byId = new Map<string, any>();

  for (const part of chunk(unique)) {
    const { data, error } = await client
      .from("projects")
      .select(columns)
      .in("organization_id", part);
    if (error) throw error;
    for (const row of data ?? []) byId.set(String(row.id), row);
  }

  const sharedIds = (await getSharedProjectIdsForOrgs(client, unique)).filter(
    (id) => !byId.has(id),
  );
  for (const part of chunk(sharedIds)) {
    const { data, error } = await client.from("projects").select(columns).in("id", part);
    if (error) throw error;
    for (const row of data ?? []) byId.set(String(row.id), row);
  }

  const rows = Array.from(byId.values());
  const orgMap = await getProjectOrgIdsMap(
    client,
    rows.map((r) => String(r.id)),
  );
  return rows.map((row) => ({
    ...row,
    organization_ids: orgMap.get(String(row.id)) ?? projectOrgIdsFromRow(row),
  }));
}

/**
 * Does a project (given its owning org ids) belong to `organizationId`?
 * Convenience wrapper for the common "project must be in the selected org".
 */
export function projectBelongsToOrg(projectOrgIds: string[], organizationId: string): boolean {
  return isMemberOfAnyProjectOrg([organizationId], projectOrgIds);
}

/** Embeds `project_organizations` in a select and falls back if the table is missing. */
export async function selectAllProjectsWithOrgs(client: Client, columns: string) {
  const first = await client.from("projects").select(`${columns}, ${PROJECT_ORG_EMBED}`);
  if (first.error && isMissingProjectOrganizations(first.error)) {
    return client.from("projects").select(columns);
  }
  return first;
}

/** Count of projects owned by (primary) or shared into `orgId`. */
export async function countProjectsInOrg(client: Client, orgId: string): Promise<number> {
  const primary = await client
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  let total = primary.count ?? 0;
  const shared = await client
    .from("project_organizations")
    .select("project_id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("is_primary", false);
  if (!shared.error) total += shared.count ?? 0;
  return total;
}
