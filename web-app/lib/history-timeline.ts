// Client-side reconstruction of entity state at an arbitrary point in time
// from the immutable entity_events log. See docs/version-control-history-plan.md

export type EntityEventOperation =
  | "create"
  | "complete"
  | "uncomplete"
  | "delete"
  | "restore"
  | "purge";

export type EntityEvent = {
  id: string;
  entity_type: "organization" | "project" | "section" | "task";
  entity_id: string;
  operation: EntityEventOperation;
  organization_id: string | null;
  project_id: string | null;
  delete_batch_id: string | null;
  snapshot: Record<string, unknown> | null;
  actor_id: string | null;
  occurred_at: string;
};

export type ReconstructedEntity = {
  entityId: string;
  entityType: EntityEvent["entity_type"];
  /** Latest snapshot at or before T (name, etc. as of that moment) */
  snapshot: Record<string, unknown> | null;
  /** Entity existed (created, not deleted/purged) at T */
  present: boolean;
  /** Entity was in the trash (soft deleted) at T */
  deleted: boolean;
  /** Task completion state at T (tasks only) */
  completed: boolean;
  /** Most recent event at or before T */
  lastEvent: EntityEvent | null;
};

export type ReconstructedState = {
  entities: Map<string, ReconstructedEntity>;
  /** Entities present (live, not deleted) at T */
  present: ReconstructedEntity[];
  /** Entities sitting in trash at T */
  deletedAtT: ReconstructedEntity[];
};

/**
 * Replay events up to and including time T and derive each entity's state.
 * Events must be the full history for the scope; order does not matter
 * (they are sorted internally).
 */
export function reconstructAt(
  events: EntityEvent[],
  t: Date,
): ReconstructedState {
  const sorted = [...events].sort(
    (a, b) =>
      new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime(),
  );
  const tMs = t.getTime();
  const entities = new Map<string, ReconstructedEntity>();

  for (const event of sorted) {
    if (new Date(event.occurred_at).getTime() > tMs) break;

    let entity = entities.get(event.entity_id);
    if (!entity) {
      entity = {
        entityId: event.entity_id,
        entityType: event.entity_type,
        snapshot: null,
        present: false,
        deleted: false,
        completed: false,
        lastEvent: null,
      };
      entities.set(event.entity_id, entity);
    }

    if (event.snapshot) entity.snapshot = event.snapshot;
    entity.lastEvent = event;

    switch (event.operation) {
      case "create":
        entity.present = true;
        entity.deleted = false;
        break;
      case "delete":
        entity.present = false;
        entity.deleted = true;
        break;
      case "restore":
        entity.present = true;
        entity.deleted = false;
        break;
      case "purge":
        entity.present = false;
        entity.deleted = false;
        break;
      case "complete":
        entity.completed = true;
        break;
      case "uncomplete":
        entity.completed = false;
        break;
    }
  }

  const all = Array.from(entities.values());
  return {
    entities,
    present: all.filter((e) => e.present),
    deletedAtT: all.filter((e) => e.deleted),
  };
}

/** Time bounds of an event list (for slider min/max). */
export function eventTimeRange(
  events: EntityEvent[],
): { start: Date; end: Date } | null {
  if (events.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const event of events) {
    const ms = new Date(event.occurred_at).getTime();
    if (ms < min) min = ms;
    if (ms > max) max = ms;
  }
  return { start: new Date(min), end: new Date(max) };
}

export function describeEvent(event: EntityEvent): string {
  const name =
    (event.snapshot?.name as string | undefined) || event.entity_type;
  switch (event.operation) {
    case "create":
      return `Created ${event.entity_type} “${name}”`;
    case "complete":
      return `Completed “${name}”`;
    case "uncomplete":
      return `Reopened “${name}”`;
    case "delete":
      return `Deleted ${event.entity_type} “${name}”`;
    case "restore":
      return `Restored ${event.entity_type} “${name}”`;
    case "purge":
      return `Permanently deleted ${event.entity_type} “${name}”`;
  }
}
