# Email Inbox — Instant-Load Optimization Plan

**Status:** Planned (not implemented) · **Date:** 2026-07-14

## Goal
Make the Email Inbox and its dependent UI (the "Accounts" dropdown in the New
Email modal, thread bodies, contacts, etc.) feel **instant**: hydrate from a
local cache at 0ms, then revalidate in the background with a subtle "updating"
indicator instead of a blocking spinner.

## Why it's slow today (the "why aren't we doing this already" answer)
The email UI hangs off **one monolithic payload**, and a cache-first system
**already exists but was deliberately disabled for the inbox**:

- `app/[view]/view-client.tsx` loads a single `database` object via
  `GET /api/database` → `loadDatabaseForUser()`, which bundles *everything*:
  tasks, projects, orgs, **mailboxes, signatures, contacts, up to 200 inbox
  threads, email rules, spam counts**.
- The inbox list, and the compose modal's account/signature/project props, only
  render after that whole blob resolves. The "Accounts dropdown" is **not** a
  separate fetch — it's props already in memory — so it's slow only because the
  full blob must land first.
- A sessionStorage snapshot cache with 5-minute TTL and instant hydration
  already exists (`view-client.tsx` `readCachedDatabaseCore`/
  `writeCachedDatabaseCore`), **but**: (1) it strips inbox items on write, and
  (2) its read path is gated behind a flag hardcoded to always fetch fresh.
- The stated reason: the **sidebar badge counts** (Inbox/Quarantine/Trash/Sent)
  are derived from `data.inboxItems`, so the code force-fetches the full
  200-thread payload every load to keep badges correct — trading away the
  instant-load win everywhere. **Realtime already exists** and correctly patches
  `email_threads` changes in place, so revalidation infrastructure is present.

## Recommendation: finish the existing cache — do NOT add a library
The app is ~80% there. Adopting TanStack Query / SWR means rewriting `fetchData`,
the realtime patch path, and the shared stores (`lib/supabase/hooks.ts`
`createSharedStore`) — high risk, large diff, little marginal benefit. Extend the
existing sessionStorage snapshot + Supabase realtime instead.

## Datasets, keys, TTLs, indicators
| Dataset | Key | Staleness | Revalidate | Indicator |
|---|---|---|---|---|
| Mailboxes / from-accounts | `ff:mailboxes:v1:{userId}` | 24h | on inbox load + realtime | silent |
| Signatures | `ff:signatures:v1:{userId}` | 24h | on inbox load | silent |
| Projects | `ff:projects:v1:{userId}` | 1h | background | silent |
| Contacts (suggest fallback) | `ff:contacts:v1:{userId}` | 1h | background | silent |
| Inbox list (≤200 threads) | `ff:inbox:v1:{userId}` | show instantly, always revalidate | mount + realtime + poll | subtle "Updating…" pill |
| Thread bodies | `ff:thread:v1:{threadId}` | 24h (immutable-ish) | open + realtime for that thread | skeleton only on cache miss |

**Indicator:** reuse the existing bottom-center status pill + the `isRefreshing`
header spinner. Render cached rows immediately; show the "Updating…" pill only
while a background revalidation is in flight. Never show a full-screen spinner
when a snapshot exists.

## Instant-open + reconciliation
1. **0ms:** on mount, synchronously hydrate `database` from the persisted
   snapshot (including `inboxItems`). Chrome + list + composer props are all
   available immediately.
2. **Background:** fire `fetchData()` (or the lighter `/api/email/inbox`) without
   a blocking skeleton; set `isRefreshing`.
3. **Reconcile:** merge via the existing `mergeDatabasePayload` /
   `applyInboxItemUpdate`; realtime continues to patch rows. Realtime patches
   write through to the snapshot so a reload stays fresh.
4. **Badge correctness (the original blocker):** derive sidebar counts from the
   cached `inboxItems` immediately, then correct them when revalidation lands.
   Optionally back badges with the lightweight `GET /api/email/unread-count` so
   they self-heal without waiting for the 200-thread payload. This removes the
   reason the cache was disabled.

## Persistence across reloads
Move the snapshot from **sessionStorage → localStorage** (or IndexedDB if the
payload exceeds ~1–2MB; 200 threads without bodies should fit localStorage).
Persist: last inbox list, mailboxes, contacts, projects, signatures. Keep
`userId` in the key + a `v` version prefix for safe invalidation. Write on every
successful `fetchData` and on realtime patches (debounced). Clear on sign-out.

## Payload-size & correctness
- Keep the inbox list to **list columns only** (already `LIST_THREAD_COLUMNS`)
  and exclude message bodies from the snapshot (bodies cached per-thread).
- Change the 200-thread `.limit(200)` to **paginated/windowed** — cache the
  first ~50, lazy-load more on scroll (~4× smaller first payload).
- Split `/api/database` so the email path can revalidate via **inbox-only**
  (`/api/email/inbox`, already exists) instead of the whole app blob.
- Treat cached `isUnread`/read-state as provisional — always let realtime +
  `unread-count` win.

## Prefetch so the compose modal opens instantly
Mailboxes/signatures/projects already arrive with the inbox load, so once the
snapshot restores, the modal is instant. Additionally warm
`/api/email/contacts/suggest` (recent/empty query) on inbox idle so the
recipient field's first keystroke has data, and trigger the already-`dynamic()`
composer chunk prefetch on idle instead of on click.

## Phased rollout
**Phase 1 — re-enable the existing cache for static email data (quick win, low risk)**
- [ ] Stop `writeCachedDatabaseCore` nulling mailboxes/signatures/projects/contacts.
- [ ] Read the snapshot on the email path; hydrate `database` before the fetch.
- [ ] Keep fetching fresh in the background; wire `isRefreshing` to the pill.
- Impact: New-Email accounts dropdown + inbox chrome open instantly on repeat visits.

**Phase 2 — cache the inbox list with correct badges (biggest win)**
- [ ] Persist `inboxItems` in the snapshot; render rows at 0ms.
- [ ] Derive badges from cached items, correct via `/api/email/unread-count` + revalidation.
- [ ] Move snapshot sessionStorage → localStorage.
- [ ] Ensure `handleRealtimeChange` writes patches back to the snapshot.
- Impact: inbox feels instant on load and refresh. Risk: medium (stale read state — mitigated by realtime + unread-count precedence).

**Phase 3 — pagination + per-thread body cache**
- [ ] Window inbox to ~50, lazy-load on scroll.
- [ ] Cache thread bodies per `threadId` (open cache-first, revalidate).
- [ ] Prefetch contacts suggest + composer chunk on inbox idle.

## Risks
- **Stale unread/read badges** → realtime + `unread-count` always win over the snapshot.
- **localStorage size** → fall back to IndexedDB on quota errors.
- **Multi-account / logout** → key by `userId`; clear snapshot on sign-out.
- **Snapshot/schema drift** → bump the `v` prefix on any inbox-item shape change; `mergeDatabasePayload` must tolerate old snapshots.
- **Do NOT add React Query** alongside — extend the existing snapshot + `createSharedStore` only.

## Key files
- `app/[view]/view-client.tsx` — cache read/write, `fetchData`, snapshot gating.
- `components/email-inbox-view.tsx` — `refreshInboxState`, `handleRealtimeChange`, badge derivation.
- `lib/supabase/hooks.ts` — `createSharedStore` pattern to reuse for mailboxes/contacts/signatures.
- `lib/email-inbox/server.ts` — `listInboxItemsForUser` column selection + `.limit(200)` → pagination.
- `app/api/database/route.ts` — split inbox-only vs full payload.
