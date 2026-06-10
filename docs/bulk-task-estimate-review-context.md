# Bulk Task Estimate Review — Session Context

**Date:** 2026-06-03
**Branch:** `feat/task-estimate-bulk-review` (off `production`)
**Plan file:** `~/.claude/plans/swift-stargazing-scott.md`
**Forge project:** Focus Forge (TPC) — task list "Bulk Task Estimate Review"

## Why this exists

The user wants the AI daily-planner to fill the calendar each morning. To do
that, every task needs a `time_estimate` (minutes). Hundreds of legacy tasks
across orgs/projects have no estimate, and individually opening each task to
add one is impractical. This feature pre-fills an AI suggestion for every
unestimated task, lets the user one-click confirm in bite-size batches, and
turns each confirmation into a labeled training example so future suggestions
calibrate to the user's actual pace.

Per explicit user direction (in the plan-mode Q&A): **no auto-apply** —
every estimate is human-approved until the model is trusted. The "training"
is via few-shot examples fed back into the estimator prompt, not fine-tuning.

## What's already committed (branch `feat/task-estimate-bulk-review`)

| Layer | File | Notes |
|---|---|---|
| DB migration | `supabase/migrations/20260602200000_task_time_estimate.sql` | Adds `tasks.time_estimate` (1–480) + partial index `tasks_unestimated_priority_due_idx` + `task_estimate_examples` table with RLS |
| AI estimator | `web-app/lib/ai-estimator/server.ts` | Now accepts `projectName`, `tags`, `priority`, `dueInDays`, `subtaskCount`, `examples[]`. System prompt weights past calibrations. Schema min lowered to 1 min. |
| AI helper | `web-app/lib/ai-estimator/examples.ts` | `fetchRecentExamples(userId, { projectName, limit })` — project-scoped first, global fallback |
| API | `web-app/app/api/tasks/unestimated/route.ts` | GET — ordered by priority asc → due_date asc → created_at asc. Supports `?limit=`, `?projectId=`, `?orgId=`, `?total=1`. Joins project + org + tags + computes subtask counts. |
| API | `web-app/app/api/tasks/estimate/bulk/route.ts` | POST `{ taskIds[] }`, capped at 25. Concurrency = 5. Subtask-sum short-circuit: parents whose subtasks are all estimated skip the LLM and return the sum at "high" confidence. Per-project example cache reused across batch. |
| API | `web-app/app/api/tasks/estimate/accept/route.ts` | POST single `{ taskId, minutes }` OR batch `{ acceptances: [...] }`. Updates `tasks.time_estimate` AND inserts `task_estimate_examples` snapshot (name/desc/project/tags/priority/AI-suggested/AI-confidence/accepted). |
| UI | `web-app/components/estimate-presets.tsx` | Shared chip group; supports `extended` (adds 1/2/3/5/10/20/45/90/180/360m) and `showInput`. |
| UI | `web-app/components/estimate-review-modal.tsx` | One-card-at-a-time. AI suggestion auto-prefills `value`. Keyboard: Enter=save, S=skip, U=use suggestion, Esc=close. Bulk-prefetches suggestions on open. |
| UI | `web-app/app/estimates/page.tsx` | Header count, "Start review" button, next-50 preview table. |
| UI | `web-app/components/estimate-review-nudge.tsx` | Mounts in root layout. localStorage gates: `estimateNudge:enabled` (off-switch) + `estimateNudge:dismissedDate` (once per day). Skips on `/auth`, `/login`, `/estimates`. |
| UI | `web-app/components/sidebar.tsx` | Added Hourglass icon import, `estimateBacklog` state + fetch, new sidebar link below Upcoming with badge. |
| UI | `web-app/app/layout.tsx` | Mounts `<EstimateReviewNudge />` next to `<AiPlannerFloatingChat />`. |

Daily-planner (`web-app/lib/daily-plan/server.ts`) was audited — it already
proposes its own estimate for null-estimate tasks via `estimatesProposed`, so
no change was needed there.

Typecheck status: clean for new files (pre-existing test errors in
`lib/__tests__/auth-urls.test.ts` and `push-notifications.test.ts` are
unrelated).

## What's left (in order)

These map 1:1 to the Forge task list — see IDs in
`./bulk-task-estimate-review-forge-ids.md` once that's saved.

### 1. **Apply the DB migration to remote** ⚠️ BLOCKER

The migration file exists but **was not applied**. Every attempt from this
environment failed:

| Method | Failure mode |
|---|---|
| Supabase MCP `apply_migration` | 401 — no `SUPABASE_ACCESS_TOKEN` env or saved CLI access token |
| `supabase link --project-ref tnjkeunwcdfmjbgkqgjj` | "Your account does not have the necessary privileges to access this endpoint" — the signed-in CLI account isn't a member of the org owning this project |
| `psql` direct (`db.tnjkeunwcdfmjbgkqgjj.supabase.co:5432`) | IPv6-only DNS, no IPv4 route from this host |
| `psql` pooler (`aws-0-*.pooler.supabase.com`, both 5432 + 6543, all major regions, `postgres.<ref>` + `postgres` user forms) | "Tenant or user not found" / ENOTFOUND — project not enrolled in the shared pooler we hit |
| 1Password search (Private + Shared) for `sbp_`, "Supabase Management", "Focus Forge DB", PAT | No matching item |

Unblock options (any one):
- Add a Supabase Management PAT (`sbp_…`) for project `tnjkeunwcdfmjbgkqgjj`
  to env / `~/.codex/.env` as `SUPABASE_ACCESS_TOKEN`; then `mcp__supabase__apply_migration`.
- Provide the project's dedicated pooler hostname + tenant string from the
  Supabase Dashboard → Project Settings → Database → Connection string.
- Enable the IPv4 add-on on the project so `db.tnjkeunwcdfmjbgkqgjj.supabase.co`
  resolves over IPv4.
- Run the SQL by hand in the Supabase Dashboard SQL editor (user's
  CLAUDE.md says never instruct user to run migrations — flagged for explicit
  override only).

### 2. **Verify schema after apply**

```sql
\d public.tasks                              -- expect time_estimate column
\d public.task_estimate_examples             -- expect new table + RLS policies
select indexname from pg_indexes where tablename='tasks' and indexname='tasks_unestimated_priority_due_idx';
```

### 3. **Dev server smoke test** — `/estimates`

```bash
cd web-app && npm run dev                    # port 3244
```

Open `http://localhost:3244/estimates`. Verify: header backlog count > 0,
sidebar badge matches, "Start review" opens the modal, AI suggestions arrive
within a few seconds for the batch, presets work, Enter saves.

### 4. **Nudge smoke test**

Clear `estimateNudge:dismissedDate` from localStorage, reload any non-auth /
non-`/estimates` page. Modal should pop with a 10-task batch. Closing should
set today's dismissal date and keep it closed until tomorrow.

### 5. **Accept 5 estimates; verify training data**

After saving, run:

```sql
select task_name, ai_suggested_minutes, ai_confidence, accepted_minutes, created_at
  from public.task_estimate_examples
  where user_id = auth.uid()
  order by created_at desc limit 5;
```

Confirm one row per accepted estimate, with `ai_suggested_minutes` populated
when the AI was used and possibly `null` when the user picked a preset
without the suggestion.

### 6. **Daily-plan sanity check**

`POST /api/daily-plan` (or use the in-app daily plan UI). Previously
unestimated tasks that now have `time_estimate` should appear in
`orderedItems` with `estimateMinutes` matching the saved value, and should
no longer appear in `estimatesProposed`.

### 7. **Settings → Preferences toggle**

Add a control under Settings → Preferences: "Prompt me to estimate tasks on
app load" (default on). Writes `estimateNudge:enabled` localStorage; the
nudge component already reads this.

### 8. **Refactor: reuse `EstimatePresets` in `task-modal.tsx`**

Replace the inline chip group in `web-app/components/task-modal.tsx` lines
1714–1740 with `<EstimatePresets value={timeEstimate} onChange={…} />`.
Standard (non-extended) preset set; reuse `showInput={false}` because the
modal already has its own minutes input.

### 9. **Open and merge PR**

`feat/task-estimate-bulk-review` → `production`. Code review the AI prompt
changes carefully; the feedback-loop schema is the most permanent piece.

### 10. **Post-merge: Railway deploy verification**

Watch Railway build/deploy logs (per user's CLAUDE.md). After successful
deploy, verify `/estimates` is reachable in production and the nudge
behaves correctly there.

## Quick references

- `.env` (in repo root, gitignored): `NEXT_PUBLIC_SUPABASE_URL=https://tnjkeunwcdfmjbgkqgjj.supabase.co`, `SUPABASE_SERVICE_ROLE_KEY=…`, `SUPABASE_DB_PASSWORD=pjfAlUkixVXuYnGx` (DB password is correct; only the connection path is blocked).
- 1Password "Focus: Forge" (Personal vault, ID `fkljm3u3ip36vpsbiae44dy6vy`) — Forge app login + PATs, NOT Supabase DB.
- 1Password "Supabase" (Personal, `6vepm7mwj76aylfbvuthqhxpuq`) — different project (`lyvxbsahqdfihhtkwwup`), NOT this one.
- `~/.codex/.env` — has `FORGE_BASE_URL` + `FORGE_PAT`; does NOT have `SUPABASE_ACCESS_TOKEN`.

## Robustness ideas baked in but not yet exercised

- **Subtask sum short-circuit** in `bulk/route.ts` — once parents with all
  subtasks estimated exist in production data, watch logs to confirm it
  fires and saves a token of LLM cost.
- **Project-scoped few-shot examples** — most useful after 10+ acceptances
  in any single project. Until then, global examples dominate.

## Robustness ideas NOT yet implemented

- "Save all visible" power-user shortcut in the review modal (mentioned in
  plan, deferred — current modal only does one at a time).
- Voice integration ("say thirty") via the existing assistant chat — out of
  scope for v1.
- Telemetry on AI estimate accuracy (delta between `ai_suggested_minutes`
  and `accepted_minutes`) — easy to add as a dashboard once examples table
  has volume.
