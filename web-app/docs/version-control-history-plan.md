# Version Control & Timeline History for Orgs / Projects / Tasks

## Context

Focus Forge currently **hard-deletes tasks** (`DELETE FROM tasks`) and only soft-flags orgs/projects/sections via `archived`/`is_deleted`. There is **no general history**: you cannot see what was deleted, restore it, or scrub backward through time to see what tasks were completed or removed on a given day. The only audit infrastructure that exists is Todoist-sync–specific.

The user wants:
1. **Safe deletion** — deleting an Org/Project/Task records history and is reversible, with an explicit **Permanently Delete** escape hatch.
2. **Moderation/rollback** — view deleted items and restore them *exactly as they were* (including children, for orgs/projects).
3. **A timeline scrubber** — drag a slider through time to see which tasks were completed / deleted / added at that moment, on the single-task page, single-project view, organization view, and a global trash/moderation page.

**Scope of v1 (per user):** track **delete/restore + completion** events only (not full field-level diff). Capture at the **Postgres trigger** layer. Restore is **cascade-aware (entity + children, original IDs)**.

## Architecture

Two pieces: (A) a uniform **soft-delete** model, and (B) an immutable **event log** populated by DB triggers. The scrubber and trash UI are both read-views over the event log + current rows.

### A. Soft delete (recoverable trash)

Add to `organizations`, `projects`, `sections`, `tasks`:
- `deleted_at TIMESTAMPTZ` — null = live, set = in trash (distinct from `archived`, which stays as-is).
- `delete_batch_id UUID` — groups a cascade so restore brings back exactly the subtree removed together.

Today FKs are `ON DELETE CASCADE` (hard). We keep them for *permanent* delete, but normal delete becomes a soft cascade: a Postgres function `soft_delete_entity(type, id)` stamps `deleted_at = now()` + a shared `delete_batch_id` on the entity **and all live descendants** (org → projects → sections/tasks → subtasks). `restore_entity(batch_id)` clears `deleted_at` for that batch (only rows whose `delete_batch_id` matches AND parent is live). Permanent delete = real `DELETE` (existing CASCADE wipes the subtree), logged as a `purge` event.

All list/read queries gain a `deleted_at IS NULL` filter (see adapter changes).

### B. Event log

New table `entity_events` (immutable, append-only):

```sql
entity_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type   TEXT NOT NULL,          -- 'organization' | 'project' | 'section' | 'task'
  entity_id     UUID NOT NULL,
  operation     TEXT NOT NULL,          -- 'create' | 'complete' | 'uncomplete' | 'delete' | 'restore' | 'purge'
  organization_id UUID,                 -- denormalized for scoping/RLS + fast timeline queries
  project_id    UUID,                   -- denormalized (null for org events)
  snapshot      JSONB,                  -- full OLD/NEW row at event time (used to render & to support restore)
  actor_id      UUID REFERENCES profiles(id),
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
)
```
Indexes: `(entity_type, entity_id, occurred_at)`, `(organization_id, occurred_at)`, `(project_id, occurred_at)`, partial index on `operation IN ('delete')` for the trash view.

**Triggers** (`AFTER` row triggers on each of the 4 tables) call a shared `log_entity_event()`:
- INSERT → `create`.
- UPDATE where `completed` flips → `complete`/`uncomplete` (tasks only).
- UPDATE where `deleted_at` goes null→set → `delete` (snapshot = full row); set→null → `restore`.
- DELETE → `purge` (snapshot = OLD row).
- Triggers capture all writers including the Todoist sync path. `actor_id` comes from `current_setting('app.actor_id', true)::uuid` when set by the adapter (best-effort; null for sync/raw writes).

This satisfies the user's two examples: deleting an org leaves a full `delete` snapshot + batch for exact restore; completion toggles produce `complete`/`uncomplete` events that the scrubber replays.

### Reconstructing state at time T (scrubber math)

For a given scope (task / project / org) and slider time T, an entity is:
- **present** if `create.occurred_at <= T` and no `purge`/`delete` before T (or a later `restore`),
- **completed at T** if its most recent `complete`/`uncomplete` before T is `complete`.

Client receives the event list for the scope once, then derives per-T state in memory (no per-tick fetch). Pure function `reconstructAt(events, T)` lives in a new `lib/history-timeline.ts`.

## Files to change

**Migration (new):** `api/supabase/migrations/<timestamp>_entity_versioning.sql`
- `ALTER TABLE` add `deleted_at`, `delete_batch_id` to the 4 tables (+ indexes).
- `CREATE TABLE entity_events` (+ indexes, RLS).
- `soft_delete_entity()`, `restore_entity()`, `log_entity_event()` functions + triggers.
- RLS on `entity_events`: SELECT/ALL gated by `user_has_organization_access(organization_id)` and `is_super_admin()`, mirroring `tasks`/`projects` policies in `api/supabase/schema.sql`.
- Mirror the same DDL into `api/supabase/schema.sql` so fresh installs match.

**Adapter:** `web-app/lib/db/supabase-adapter.ts`
- Replace `deleteTask`/`deleteProject`/`deleteOrganization`/`deleteSection` (`deleteTask` at line 1160) to call `soft_delete_entity` RPC instead of `.delete()`.
- Add `purge<Entity>(id)` (real delete), `restoreEntity(batchId)`, `getTrash()`, `getEntityHistory(type, id)`, `getScopeHistory({organizationId|projectId})`.
- Add `deleted_at IS NULL` to all list selects (`getTasks`, `getProjects`, `getOrganizations`, `getSections`).
- Set `app.actor_id` GUC via RPC at start of mutating calls so triggers capture the actor.

**API routes:**
- Change existing `DELETE` handlers to soft delete: `app/api/tasks/[id]/route.ts`, `app/api/projects/[id]/route.ts`, `app/api/organizations/[id]/route.ts`, `app/api/sections/route.ts`.
- New: `app/api/history/route.ts` (scope history for scrubber), `app/api/trash/route.ts` (GET list), `app/api/trash/restore/route.ts` (POST `{batchId}`), `app/api/trash/purge/route.ts` (POST `{type,id}` — permanent delete, requires confirm flag).

**Frontend:**
- New `web-app/lib/history-timeline.ts` — `reconstructAt()` + event types.
- New `web-app/components/history-timeline-scrubber.tsx` — adapts the SVG/scrub pattern from `components/project-progress-timeline.tsx` (reuse `xPosition`/`fromDateKey` helpers); adds a draggable slider handle (Radix `Slider` or pointer-drag on the existing SVG) and emits a selected `Date`; renders the reconstructed task set (completed/deleted/active badges).
- New `web-app/app/trash/page.tsx` (or `view="trash"` in `app/[view]/page.tsx`) — moderation list grouped by delete batch with **Restore** and **Permanently Delete** (confirm dialog reusing the existing `taskDeleteConfirm` pattern in `app/[view]/page.tsx`).
- Wire the scrubber into: single-task modal (EditTaskModal), single-project view (`view="project-{id}"` in `app/[view]/page.tsx`, near where `ProjectProgressTimeline` mounts), and org view (`view="org-{id}"`).
- Update delete handlers (`confirmTaskDelete`, project/org delete) to show an **Undo** toast (reuse `showUndoCompletion` pattern) that calls restore.

## Verification

1. Run the migration locally against Supabase (apply via the `supabase` skill / `op`-sourced creds — never ask the user to migrate).
2. `npm run dev` (port 3244). Using the **playwright** skill headless:
   - Create an org → project → tasks. Delete a task → confirm it vanishes from lists, appears in `/trash`, and an `entity_events` `delete` row exists.
   - Restore it → reappears identical (same id). Complete/uncomplete a task → events logged.
   - Delete the whole org → restore from trash → confirm projects+sections+tasks all return (one batch).
   - Permanently Delete from trash → row gone, `purge` event logged, restore no longer offered.
   - Open scrubber on project view, drag slider back/forward → completed/deleted tasks appear/disappear at the right timestamps.
3. Screenshot each scrubber + trash page, `Read` inline to confirm.
4. Confirm Todoist sync writes still produce events (trigger-level capture) and don't break.

## Notes / risks
- Triggers capture **every** writer, so the Todoist importer's bulk writes will generate events — fine, but verify no perf regression on large syncs (the migration adds indexes for this).
- `ON DELETE CASCADE` FKs remain for *purge*; soft delete must never call raw `.delete()` again — audit the adapter for stray `.delete()` calls on these tables.
- v1 intentionally omits field-level history (name/due-date diffs); the `entity_events.snapshot` JSONB already stores full rows, so upgrading to field-level later is additive (no schema change).
