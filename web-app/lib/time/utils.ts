import type {
  TimeTrackingEntry,
  TimeTrackingGroup,
  TimeTrackingProjectOption,
  TimeTrackingSectionOption,
  TimeTrackingTaskOption,
  TimeTrackingToken,
  TimeTrackingTokenWithSecret,
  TimeTrackingUserOption,
  TimeScope,
  TimeTokenShareMode,
} from "./types";

export const ALLOWED_TIME_SCOPES: TimeScope[] = ["read", "write", "admin"];

export function mapTimeScopes(scopes: unknown): TimeScope[] {
  if (!Array.isArray(scopes)) {
    return ["read"];
  }

  const normalized = scopes.filter((scope): scope is TimeScope =>
    typeof scope === "string" && ALLOWED_TIME_SCOPES.includes(scope as TimeScope),
  );

  if (!normalized.includes("read")) {
    normalized.unshift("read");
  }

  return Array.from(new Set(normalized));
}

export function mapTimeToken(row: any): TimeTrackingToken {
  const shareMode =
    row?.share_mode === "organization" || row?.share_mode === "selected"
      ? (row.share_mode as TimeTokenShareMode)
      : "private";

  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    name: String(row.name),
    description: row.description ?? null,
    prefix: String(row.prefix),
    maskedKey: `${String(row.prefix)}••••••••`,
    scopes: mapTimeScopes(row.scopes),
    expiresAt: String(row.expires_at),
    lastUsedAt: row.last_used_at ?? null,
    isActive: Boolean(row.is_active),
    createdAt: String(row.created_at),
    createdBy: String(row.created_by),
    shareMode,
    sharedUserIds: Array.isArray(row.token_users)
      ? row.token_users
          .map((item: any) => item?.user_id)
          .filter((value: unknown): value is string => typeof value === "string")
      : [],
    sharedGroupIds: Array.isArray(row.token_groups)
      ? row.token_groups
          .map((item: any) => item?.group_id)
          .filter((value: unknown): value is string => typeof value === "string")
      : [],
  };
}

export function mapTimeTokenWithSecret(
  row: any,
  secret: string,
): TimeTrackingTokenWithSecret {
  return {
    ...mapTimeToken(row),
    secret,
  };
}

export function mapTimeGroup(row: any): TimeTrackingGroup {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    name: String(row.name),
    description: row.description ?? null,
    createdBy: String(row.created_by),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    memberIds: Array.isArray(row.group_members)
      ? row.group_members
          .map((item: any) => item?.user_id)
          .filter((value: unknown): value is string => typeof value === "string")
      : [],
  };
}

export function mapTimeUser(row: any): TimeTrackingUserOption {
  const firstName = typeof row.first_name === "string" ? row.first_name : "";
  const lastName = typeof row.last_name === "string" ? row.last_name : "";
  const fullName = `${firstName} ${lastName}`.trim();

  return {
    id: String(row.id),
    name: fullName || row.email || "Unknown user",
    email: typeof row.email === "string" ? row.email : "",
    role:
      row.role === "team_member" || row.role === "admin" || row.role === "super_admin"
        ? row.role
        : null,
  };
}

export function mapTimeProject(row: any): TimeTrackingProjectOption {
  return {
    id: String(row.id),
    name: String(row.name),
    organizationId: String(row.organization_id),
  };
}

export function mapTimeSection(row: any): TimeTrackingSectionOption {
  return {
    id: String(row.id),
    name: String(row.name),
    projectId: String(row.project_id),
  };
}

export function mapTimeTask(row: any): TimeTrackingTaskOption {
  return {
    id: String(row.id),
    name: String(row.name),
    projectId:
      typeof row.project_id === "string" && row.project_id.length > 0
        ? row.project_id
        : null,
    sectionId:
      typeof row.section_id === "string" && row.section_id.length > 0
        ? row.section_id
        : null,
  };
}

export function mapTimeEntry(row: any): TimeTrackingEntry {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    userId: String(row.user_id),
    projectId: row.project_id ?? null,
    sectionId: row.section_id ?? null,
    title: String(row.title),
    description: row.description ?? null,
    timezone: String(row.timezone),
    startedAt: String(row.started_at),
    endedAt: row.ended_at ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    taskIds: Array.isArray(row.entry_tasks)
      ? row.entry_tasks
          .map((item: any) => item?.task_id)
          .filter((value: unknown): value is string => typeof value === "string")
      : [],
    source: typeof row.source === "string" ? row.source : "focus_forge",
    sourceMetadata:
      row.source_metadata && typeof row.source_metadata === "object"
        ? row.source_metadata
        : {},
    user: row.profiles ? mapTimeUser(row.profiles) : null,
    project: row.projects ? mapTimeProject(row.projects) : null,
    section: row.sections ? mapTimeSection(row.sections) : null,
    organization: row.organizations
      ? { id: String(row.organizations.id), name: String(row.organizations.name) }
      : null,
    tasks: Array.isArray(row.entry_tasks)
      ? row.entry_tasks
          .map((item: any) => (item?.tasks ? mapTimeTask(item.tasks) : null))
          .filter((value: TimeTrackingTaskOption | null): value is TimeTrackingTaskOption =>
            Boolean(value),
          )
      : [],
  };
}

export function normalizeTimeZone(timezone: unknown) {
  if (typeof timezone === "string" && timezone.trim().length > 0) {
    return timezone.trim();
  }

  return "UTC";
}

export function resolveBaseUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3244";
}
