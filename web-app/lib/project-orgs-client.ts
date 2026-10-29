// Pure, client-safe helpers for multi-organization project ownership.
// `organizationId` is the PRIMARY owner; `organizationIds` lists all owners (primary first).

export interface ProjectOrgShape {
  id?: string
  organizationId?: string | null
  organizationIds?: string[] | null
}

export function getProjectOrganizationIds(project: ProjectOrgShape): string[] {
  const legacy = (project as { organization_id?: string | null }).organization_id
  const primary = project.organizationId || legacy || undefined
  const ids: string[] = []
  if (primary) ids.push(primary)
  for (const id of project.organizationIds ?? []) {
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
}

export function projectBelongsToOrganization(
  project: ProjectOrgShape,
  orgId: string | null | undefined,
): boolean {
  if (!orgId) return false
  return getProjectOrganizationIds(project).includes(orgId)
}

export function isSharedProject(project: ProjectOrgShape): boolean {
  return getProjectOrganizationIds(project).length > 1
}

export function dedupeProjectsById<T extends { id: string }>(projects: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const p of projects) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    out.push(p)
  }
  return out
}

/** Build optimistic organizationLinks for a desired id set (primary first). */
export function buildOrganizationLinks(
  primaryId: string,
  organizationIds: string[],
  existing?: { organizationId: string; role: 'manager' | 'member'; isPrimary: boolean }[],
) {
  const ids = [primaryId, ...organizationIds.filter((id) => id !== primaryId)]
  return ids.map((organizationId) => ({
    organizationId,
    role:
      existing?.find((l) => l.organizationId === organizationId)?.role ??
      ('manager' as const),
    isPrimary: organizationId === primaryId,
  }))
}
