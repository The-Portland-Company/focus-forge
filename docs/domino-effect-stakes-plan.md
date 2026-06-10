# Domino Effect — Stakes, Chains & Weighted Scheduling

## Context

Forge tasks today rank only by priority (1–4) and due date. But real-world prioritization is driven by **stakes**: what bad thing happens if a task slips (consequence), what good thing happens if it's done (reward), when the domino falls, and whether it recurs. Example: "drive Uber 2hrs" and "install washer electrical (12hrs)" both neutralize the same $40/week laundromat cost — one defuses it once, the other eliminates it forever. The right pick depends on today's capacity, and the user shouldn't have to reason through it manually.

Decisions made with the user during brainstorming:
- **Stakes are first-class entities** — one `stakes` table, `kind: consequence | reward` (unified "Stake" model, signed semantics).
- **Weight is multi-dimensional**: dollars where possible, severity tiers (minor/moderate/severe/critical → dollar-equivalents) otherwise, composite of cost × urgency × recurrence; rewards count positively.
- **Full cascade chains now**: stake → stake edges; effective weight = own + 0.7^hop discounted downstream. ("no clean clothes → can't Uber → can't earn next week" makes laundry worth far more than $40.)
- **Decay ramp**: urgency multiplier grows as `trigger_at` approaches.
- **Recurrence + fix type**: stakes can recur ($40/week); task↔stake links carry `resolution_type: defuses_once | eliminates` — eliminate resolvers valued at recurrence × horizon (~52 weeks).
- **Engine: rules first, AI explains** — deterministic server-side scoring feeds the **existing AI daily planner** (`runDailyPlanner`, GPT-4.1, already capacity-aware via `daily_capacity_minutes` + `time_estimate`), which assembles the day and writes rationale.
- **Capture: AI-assisted NL extraction** (one sentence → stakes/edges/links proposal → confirm), with manual editor fallback.
- **Surfaces (web first, mobile read API)**: domino badge on Today/Next Up, Daily Domino Briefing (extend daily-plan-card), Domino board view, stake editor on task detail.

## Phase 1 — Migration

New `supabase/migrations/20260603200000_domino_stakes.sql`; mirror DDL into `api/supabase/schema.sql`. Four tables, all RLS-enabled, UUID PKs, FK indexes, soft-delete columns (`deleted_at`, `delete_batch_id`) per the entity_versioning precedent (`supabase/migrations/20260603190000_entity_versioning.sql`):

- **`stakes`**: organization_id (NOT NULL), project_id (nullable), kind ('consequence'|'reward'), name, description, monetary_value NUMERIC (nullable, stored positive), severity ('minor'|'moderate'|'severe'|'critical', for non-monetary), trigger_at TIMESTAMPTZ, recurrence TEXT + recurrence_interval_days INTEGER (denormalized; defer full grammar parsing), status ('active'|'defused'|'eliminated'|'expired').
- **`stake_edges`**: parent_stake_id, child_stake_id, weight_multiplier (default 0.7), UNIQUE(parent,child), CHECK(parent≠child), plus a BEFORE INSERT trigger with `WITH RECURSIVE` reachability check to reject cycles.
- **`task_stakes`**: (task_id, stake_id) PK, resolution_type ('defuses_once'|'eliminates').
- **`stake_extraction_examples`**: per-user few-shot calibration (raw_input, accepted_payload JSONB) — mirrors `task_estimate_examples`.

RLS: `stakes` via `user_has_organization_access(organization_id)`; edges/links via EXISTS join to parent stake's org (task_tags pattern); examples via `user_id = auth.uid()`. Partial index on `stakes(trigger_at) WHERE status='active' AND deleted_at IS NULL`.

Deferred v1: event-log/trash trigger wiring for stakes, cascade depth caps beyond the lib guard.

## Phase 2 — Deterministic scoring lib

New `web-app/lib/domino/constants.ts` + `web-app/lib/domino/scoring.ts` (pure functions):

- `SEVERITY_DOLLARS = { minor: 25, moderate: 100, severe: 400, critical: 1500 }`, `HOP_DISCOUNT = 0.7`, `ELIMINATE_HORIZON_WEEKS = 52`, `URGENCY = { maxMultiplier: 3, rampDays: 14 }`.
- `baseWeight(stake)` — monetary_value or severity dollar-equivalent.
- `effectiveWeight(stakeId, graph)` — DFS over edges with visited-set cycle guard + memoization; own + Σ discounted children.
- `urgencyMultiplier(triggerAt, now)` — 1 → 3 ramp over final 14 days.
- `resolutionMultiplier(stake, link)` — defuses_once = 1×; eliminates = recurrence-aware horizon multiple.
- `computeTaskDominoScores({stakes, edges, links, taskEffortMinutes})` → per-task `{ score, contributions[], topStakeId, nearestTriggerAt }`; score = Σ effectiveWeight × urgency × resolutionMult ÷ effortHours (floor 0.25h). Rewards and avoided-consequences both add positive value; signed contribution retained for display.

Tests: `web-app/lib/__tests__/domino-scoring.test.ts` — severity vs monetary, 3-deep chain discount, cycle safety, urgency boundaries, eliminates horizon math ($40/wk → ~$2,080 discounted), effort floor.

## Phase 3 — API routes

CRUD via new adapter methods in `web-app/lib/db/supabase-adapter.ts` (createStake, updateStake, getStakes, createStakeEdge, linkTaskStake, …), `requireAuth` + RLS-scoped client like the daily-plan route:

- `web-app/app/api/stakes/route.ts` (GET list / POST), `api/stakes/[id]/route.ts` (GET/PATCH/DELETE soft), `api/stakes/edges/route.ts` (POST/DELETE; DB cycle error → 409).
- `web-app/app/api/tasks/[id]/stakes/route.ts` — manage links + resolution_type.
- `web-app/app/api/domino/scores/route.ts` — POST: fetch stakes/edges/links/efforts → `computeTaskDominoScores`.
- `web-app/app/api/domino/board/route.ts` — GET: active stakes, fall dates, effective weights, resolver tasks, edges.
- `web-app/app/api/domino/extract/route.ts` — NL capture (Phase 6).
- Mobile: read endpoints under `web-app/app/api/mobile/stakes/` following existing mobile patterns (writes deferred).

## Phase 4 — Planner integration

Modify `web-app/app/api/daily-plan/route.ts` + `web-app/lib/daily-plan/server.ts`:
- Route: after building planTasks, compute domino scores for eligible tasks; attach compact `domino` object per task `{ score, topStakeSummary, nearestTriggerAt, stakes: [{name, kind, dollarEquivalent, triggerAt, resolution}] }`; pre-sort planTasks by score so ordering is anchored deterministically.
- `server.ts`: serialize `domino` into the user message; extend system prompt — dominoScore is the primary ranking signal, AI applies capacity/deadline judgment and must explain the domino in each rationale (what falls, when, $-equivalent, defuse vs eliminate). Response schema + `lib/daily-plan/types.ts` gain optional `dominoScore` / `dominoRationale` on ordered items.
- Existing capacity/short-circuit logic unchanged.

## Phase 5 — UI surfaces

- `web-app/components/domino-badge.tsx` — urgency-colored chip ($-equivalent + countdown to trigger_at), tooltip = AI rationale; render on Today/Next Up task rows.
- Extend `web-app/components/daily-plan-card.tsx` — Daily Domino Briefing header ("These dominoes fall soon; with your X free hours, here's the optimal set") + per-item badge.
- `web-app/components/domino-board.tsx` + new app-router page — active stakes with fall date, effective weight, resolver tasks, chain visualization (indented adjacency list/simple SVG v1; graph layout lib deferred).
- `web-app/components/stake-editor.tsx` in task modal — list/add/edit stakes, manage edges, NL capture box.

## Phase 6 — AI-assisted capture

New `web-app/lib/domino/ai.ts` modeled on `web-app/lib/email-inbox/ai.ts` (gpt-4.1, strict json_schema, confidence + reason, heuristic fallback parsing `$N` and weekday deadlines when no API key). `extractStakesWithAI` returns `{ stakes[], edges[], links[] }` proposals; `/api/domino/extract` serves them; on user confirm, persist + append to `stake_extraction_examples` for few-shot improvement (parallel to estimate-accept flow).

## Verification

1. Unit tests for scoring lib (deterministic, no I/O).
2. Migration on a Supabase branch (`create_branch` + `apply_migration`), `get_advisors` lint, cross-org RLS denial check.
3. API: stake CRUD round-trip, cycle rejection 409, scores endpoint with seeded data; `/api/daily-plan` carries dominoScore + domino-aware rationale (seed one eliminates-recurring + one near-trigger defuses_once stake; both must outrank an unstaked task).
4. UI smoke via playwright skill: badge, briefing countdown, board chains, NL capture round-trip.

Deferred v1: stake trash/history wiring, full recurrence grammar, fancy graph viz, mobile writes, multi-currency.
