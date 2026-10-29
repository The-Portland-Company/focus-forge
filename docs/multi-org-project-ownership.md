# Multi-organization project ownership

One project can be owned by, and fully visible to, several organizations (first use
case: The Portland Company + client org "VarCentral", both as full managers).

Branch: `feat/multi-org-project-ownership` (NOT deployed, NOT merged).

## Model

- `projects.organization_id` stays the PRIMARY owner (unchanged column/FK/readers).
- New `public.project_organizations (project_id, organization_id, role, is_primary, added_by, created_at)`
  lists EVERY owning org. The `is_primary` row mirrors `projects.organization_id`
  (trigger-synced, backfilled for all existing projects); other rows are the shared orgs.
  `role`: `manager` (org owners may administer the project) or `member` (work access only). RLS is identical for both.
- Access = caller belongs to the primary org OR any linked org (super admin as before).
- Only admins of the PRIMARY org (or global admins) add/remove orgs or move the primary.
  Managers of an additional org have full project admin otherwise.

## Migrations (apply in this order; directory `web/supabase/migrations/`)

| file | what | reversible by |
|---|---|---|
| `20261028000000_project_organizations.sql` | table + RLS, backfill, helpers `user_belongs_to_project_org`, `user_has_project_org_access`, `project_org_ids`, `is_project_org_admin`, `is_project_primary_org_admin` (SECURITY DEFINER, `search_path=''`, anon revoked), sync trigger, primary-org-change guard trigger, org-delete reassign trigger | `supabase/rollbacks/20261028000000_project_organizations_down.sql` |
| `20261028000100_project_organizations_rls.sql` | 42 `ALTER POLICY` (one transaction) | `..._rls_down.sql` (restores exact prior expressions) |
| `20261028000200_soft_delete_entity_shared_projects.sql` | `soft_delete_entity('organization')` no longer soft-deletes shared projects | `..._down.sql` |

Rollback order: C, then B, then A. Dropping the table loses only the shared links.
Verified: after running all three rollbacks on a scratch DB, `pg_policies` is byte-identical to the pre-change schema.

### Org deletion
`projects.organization_id` keeps `ON DELETE CASCADE` (unshared projects are removed with their org, as today).
A BEFORE DELETE trigger on `organizations` first re-points every shared project at its oldest remaining
org and then fails closed (raises) if any shared project would still be cascaded.

### Hijack guard
RLS cannot restrict columns, so without a guard a member of a shared org could set `organization_id` to their
own org and evict the owner. `guard_project_primary_org_change` makes changing the primary org of a SHARED project
require admin of the OLD primary org (user sessions only; service role / SQL are exempt). Covered by a negative-control test.

## pg_policies before / after

Full unified diff: `docs/multi-org-project-ownership.pg_policies.diff` (generated from schemas rebuilt by replaying every repo migration,
before = all migrations except 20261028*, after = all). Regenerate on LIVE with `supabase/tests/pg_policies_snapshot.sql`.

Changed (expression only; name, command and roles unchanged). Pattern A = `user_has_organization_access(p.organization_id)`
-> `user_has_project_org_access(p.id)` (still includes super admin). Pattern B = inline `projects JOIN user_organizations`
-> `user_belongs_to_project_org(...)` (membership only, NO super admin, exactly like before).

| table | policy | cmd |
|---|---|---|
| `attachments` | Users can manage attachments for their tasks | ALL |
| `attachments` | Users can view attachments for their tasks | SELECT |
| `comments` | Users can manage comments on their tasks | ALL |
| `comments` | Users can view comments in their organizations | SELECT |
| `comments` | Users can view comments on their tasks | SELECT |
| `entity_events` | Users can view entity events in their organizations | SELECT |
| `goals` | Users can create goals in their projects | INSERT |
| `goals` | Users can delete goals in their projects | DELETE |
| `goals` | Users can update goals in their projects | UPDATE |
| `goals` | Users can view goals in their projects | SELECT |
| `on_hand_supplies` | Users can delete on-hand supplies in their projects | DELETE |
| `on_hand_supplies` | Users can insert on-hand supplies in their projects | INSERT |
| `on_hand_supplies` | Users can update on-hand supplies in their projects | UPDATE |
| `on_hand_supplies` | Users can view on-hand supplies in their projects | SELECT |
| `plans` | Users can create plans in their orgs | INSERT |
| `plans` | Users can delete plans in their orgs | DELETE |
| `plans` | Users can update plans in their orgs | UPDATE |
| `plans` | Users can view plans in their orgs | SELECT |
| `project_shares` | project_shares_member_all | ALL |
| `projects` | Team members can update projects in their organizations | UPDATE |
| `projects` | Users can view projects in their organizations | SELECT |
| `reminders` | Users can manage reminders for their tasks | ALL |
| `reminders` | Users can view reminders for their tasks | SELECT |
| `sections` | Users can create sections in their projects | INSERT |
| `sections` | Users can delete sections in their projects | DELETE |
| `sections` | Users can manage sections in their projects | ALL |
| `sections` | Users can update sections in their projects | UPDATE |
| `sections` | Users can view sections in their projects | SELECT |
| `task_reorg_batches` | Members can create reorg batches | INSERT |
| `task_reorg_batches` | Members can update reorg batches | UPDATE |
| `task_reorg_batches` | Members can view reorg batches | SELECT |
| `task_reorg_moves` | Members can create reorg moves | INSERT |
| `task_reorg_moves` | Members can update reorg moves | UPDATE |
| `task_reorg_moves` | Members can view reorg moves | SELECT |
| `task_sections` | Users can manage task sections in their projects | ALL |
| `task_sections` | Users can view task sections in their projects | SELECT |
| `task_tags` | Users can manage task tags for their tasks | ALL |
| `task_tags` | Users can view task tags for their tasks | SELECT |
| `tasks` | Users can manage tasks in their projects | ALL |
| `tasks` | Users can view tasks in their projects | SELECT |
| `user_projects` | Org admins can manage project memberships | ALL |
| `user_projects` | Users can view project memberships | SELECT |
| `projects` (2 rows above) | SELECT uses `user_has_project_org_access(id)`; UPDATE adds an explicit WITH CHECK: access to the row AND (new primary org is one the caller belongs to OR is already linked to the project) | |

Added: 4 policies on `project_organizations` (select: project access; insert/update/delete: non-primary rows only, primary-org admins only).

NOT changed on purpose:
- `projects` INSERT / "Admins can manage projects in their organizations" WITH CHECK (still `user_has_organization_access(organization_id)`): a project can only be created in a primary org you belong to.
- Policies keyed on a table's OWN `organization_id` column (stakes, task_stakes, stake_edges, audit_logs, contacts, plans' own-org branch, email_*, time_tracking.*, mailboxes...; `task_reorg_*` keep their org branch and gain an additive project branch). The prior audit listed domino/stakes/audit as joining `projects`; in the real schema they do not.

## Tests

`web/scripts/test-project-orgs-rls.sh` (needs a scratch Postgres, never prod):
1. Parity: with nothing shared, a 9-user x 14-table read matrix plus 7 write probes is byte-identical before vs after the migrations.
2. 60+ assertions on shared projects (visibility of every child table, write access, who may share/unshare, role manager vs member, hijack guard, helper behaviour, anon privileges, unshare, primary move, soft/hard org delete).
App: `web-app/lib/__tests__/supabase-adapter.test.ts` (visibility + getProjects with a fake client), `project-orgs-client.test.ts`, plus route tests listed in the PR.

## Review / deploy checklist (do NOT run until reviewed)

1. Review: `git diff origin/production...feat/multi-org-project-ownership`; read the three migrations and the policy diff.
2. Locally: `PGURL=postgres://postgres@127.0.0.1:5432 web/scripts/test-project-orgs-rls.sh` and `cd web/web-app && npm test && npx tsc --noEmit`.
3. On LIVE read-only: run `supabase/tests/pg_policies_snapshot.sql` -> `before.txt`; confirm the 42 policy names/expressions match the "before" side of the diff (live may have drifted from the repo).
4. Take a Supabase backup/PITR marker. Apply A, then B, then C (separate transactions; each is idempotent-safe to re-run). The app tolerates the table being absent, so migrations can go first, code second.
5. Run the snapshot again -> `after.txt`; `diff before.txt after.txt` must equal the committed diff (modulo drift). Re-run the parity probe against a staging copy if available.
6. Deploy the app. Smoke: an existing user's project list is unchanged; then create the share (PUT `/api/projects/<id>` with `organization_ids`) and check a VarCentral member sees the project and nothing else of The Portland Company.
7. Rollback = C, B, A rollback files, then redeploy previous app build (the old build ignores the new table).

## Known limits / risks

- Org-scoped records stay single-org by design: audit_logs, time entries, stakes/domino, reorg batches, email-linked data belong to one org. Shared-org members see project events (entity_events) but audit_logs for the project remain in the primary org.
- `role = manager|member` is enforced at the app layer and for `user_projects` management; data RLS treats both the same.
- A shared-org manager can soft-delete the shared project for everyone (full manager, per requirement).
- The pending TPC Auth migration (`web-app/supabase/migrations/20260924000001_tpc_auth_deferred_drop.sql`, marked DO NOT APPLY) would drop `organizations`, `user_organizations` and `projects.organization_id`. It is incompatible with this model and must be reworked (tpc_org_id) before it is ever applied.
