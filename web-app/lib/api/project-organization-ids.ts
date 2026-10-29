/**
 * Parses the `organization_ids` / `organizationIds` request field used by
 * POST /api/projects and PUT /api/projects/[id].
 *
 * Returns `undefined` when the field is absent (caller must leave sharing
 * untouched), otherwise the de-duplicated list of non-empty string ids.
 * Throws a `{status: 400}` Error for a malformed value so a typo can never be
 * interpreted as "unshare everything".
 */
export function parseOrganizationIdsInput(body: unknown): string[] | undefined {
  if (!body || typeof body !== "object") return undefined;
  const raw =
    (body as Record<string, unknown>).organization_ids ??
    (body as Record<string, unknown>).organizationIds;
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.some((id) => typeof id !== "string")) {
    const err: any = new Error("organization_ids must be an array of organization id strings");
    err.status = 400;
    throw err;
  }
  return Array.from(new Set((raw as string[]).map((id) => id.trim()).filter(Boolean)));
}
