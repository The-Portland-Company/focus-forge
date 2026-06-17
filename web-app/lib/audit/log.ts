// Best-effort audit logging for destructive actions.
//
// Writes go to public.audit_logs via the *authed, RLS-scoped* Supabase client
// (the audit_logs INSERT policy allows org members), never service-role. Every
// write is wrapped so a failure can never break the primary action — callers
// invoke this AFTER their delete has already succeeded.
//
// The Settings -> Activity UI that surfaces these rows is intentionally
// deferred; this module only records the trail.

export type AuditAction =
  | "task.delete"
  | "thread.delete"
  | "project.delete"
  | "member.remove";

export type AuditEntityType = "task" | "thread" | "project" | "member";

export interface AuditLogEntry {
  organizationId: string;
  actorUserId: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Pure builder: normalizes an audit entry into the audit_logs row shape.
 * Kept side-effect-free so it can be unit-tested without a DB.
 */
export function buildAuditLogRow(entry: AuditLogEntry): {
  organization_id: string;
  actor_user_id: string | null;
  action: AuditAction;
  entity_type: AuditEntityType;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
} {
  return {
    organization_id: entry.organizationId,
    actor_user_id: entry.actorUserId ?? null,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId != null ? String(entry.entityId) : null,
    metadata:
      entry.metadata && Object.keys(entry.metadata).length > 0
        ? entry.metadata
        : null,
  };
}

/**
 * Best-effort insert of an audit entry. Swallows all errors (and a missing
 * organizationId) so the caller's primary action is never affected.
 *
 * @param supabase An authed, RLS-scoped Supabase client (NOT service-role).
 */
export async function writeAuditLog(
  supabase: any,
  entry: AuditLogEntry,
): Promise<void> {
  try {
    if (!entry.organizationId) return;
    const row = buildAuditLogRow(entry);
    const { error } = await supabase.from("audit_logs").insert(row);
    if (error) {
      console.error("writeAuditLog insert failed:", error.message || error);
    }
  } catch (err) {
    console.error("writeAuditLog threw (suppressed):", err);
  }
}
