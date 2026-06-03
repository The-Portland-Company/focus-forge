# Focus: Forge — Project Completion Context

**Purpose:** the canonical "what's left before this project is finished" reference. Mirror of the open work in the **Focus: Forge** project on Forge (org *The Portland Company*, project id `83239d6d-8fe8-43f5-b658-eba92d9f14cc`). Update both this doc and Forge when scope shifts.

Production URL: <https://focusforge.theportlandcompany.com> · Deploy: push to `production` → GitHub Actions → Railway (project `fbc264f9-bb98-4fbd-a7c6-ccbf3f728280`, service `app`, env `production`).

Code root: `focus-forge-web/web-app/` (Next.js). Sibling repos: `focus-forge-ios-app/`, `focus-forge-mac-os-app/`, `focus-forge-time-tracker/`.

---

## Definition of done (project-level)

The project is "finished" when each of the sections below is true:

1. **AI features run reliably in production.** All three providers configured with credit, voice transcription works, agent honest about tool calls, no silent quota failures.
2. **Email Inbox is fully featured & accurate.** Inbox/Quarantine/Trash/Sent/Rules counts correct everywhere, threading reliable, sort/filter usable, dock badge live.
3. **Today view is informational and capacity-aware.** Daily Plan opt-in, billing-aware errors, real Email Work triage with sync status.
4. **Auth, RLS, and multi-org access controls are watertight.** No service-role leaks to client; RLS covers all tables.
5. **Native apps reach baseline feature parity.** iOS email module shipped; macOS Focus Dock paired.
6. **Operational basics in place.** Sentry quiet, observability via Railway/Cloudflare, deploy auto-recovers, migrations versioned.

---

## Open work, grouped

### 1. AI / model infrastructure
- **#1 Multi-provider voice transcription.** Groq Whisper fallback **code is deployed**; needs a `gsk_…` Groq key in Railway (`GROQ_API_KEY`). xAI/Anthropic don't have STT — Groq is the working STT fallback.
- **Provider credit.** OpenAI (insufficient_quota), Anthropic ($5 active), xAI (team over spending limit). The agent currently answers via Claude only. Fund OpenAI and raise xAI's team spending limit to restore fallback breadth. See [[ai-providers-out-of-credit]] in memory.
- **Daily Plan provider awareness.** Today's "What's Next?" card calls OpenAI directly for the planner. Wire it through the multi-provider fallback or surface a clearer provider note (currently it only surfaces a billing-page link).

### 2. Email Inbox & Email Work (active focus area)
- **#17 Default-filter Spam** out of `/email-inbox` (classification === 'spam'); keep a toggle to show them.
- **#18 Project picker loading indicator** on Email Inbox: show spinner in place of the picked project until the server confirms.
- **Spam classification accuracy.** Manual training feedback into rules table; surface the confidence threshold.
- **Sort + filter persistence** on `/email-inbox` (not just on Today). Today's controls were shipped in #15.
- **Email accounts management.** Add UI for connecting/disconnecting mailboxes from Settings (currently only API + a small modal on Today).
- **Reply / send reliability.** Reply drafts queue exists; verify error handling and scheduled-send retry path.

### 3. Today view
- Today's mailbox refresh + last-sync UI shipped (#14). Outstanding: surface per-mailbox last-sync error inline in the Email Work header, not only in the modal.
- Persist user's Email Work sort/filter choice across sessions (currently in-memory).
- Add a "Plan again with X" provider override on the Daily Plan card so the user can route around a quota error in one click.

### 4. Sidebar, dock & PWA
- **Dock badge:** code (`DockBadgeSync`) requests Notification permission and writes `setAppBadge`. Requires installed Web App + Notifications-in-Web-App grant. Document in onboarding.
- Add a Settings toggle to **disable the dock badge** (some users prefer a quiet dock).
- **macOS Focus Dock** companion (separate repo) — finish the IPC contract with the Web App.

### 5. Auth, security, RLS
- **Row-Level Security audit** on every Supabase table — currently service-role bypasses are common in `lib/email-inbox/server.ts`. Lock to least-privilege.
- **Invite & onboarding flow** for new users in an org (CLAUDE.md roadmap item, still TODO).
- **Password reset** end-to-end test on prod email delivery.
- **Audit logging** for destructive actions (delete task, delete thread, delete project).

### 6. Native apps
- **iOS email parity** (9 child tasks already in Forge: shared data layer, list, search, detail, sort/actions, compose, AI tools, mailbox push, notifications).
- **macOS Focus Dock** — finish dock badge IPC + system tray menu.
- Push-notifications backend (Resend/APNs/Firebase choice not yet decided).

### 7. Observability & operational
- **Sentry triage** (existing 🤖 Forge tasks: replicate Safari 26 load failure, review TypeError, fix). See Forge.
- **Daily plan caching** — currently per-day in localStorage; consider server-side cache to avoid duplicate AI runs across devices.
- **Railway deploy via push** is wired (project token `RAILWAY_TOKEN` set; CI runs `railway up --service app`). Document in CONTRIBUTING.
- **Migrations** — every schema change must be a file in `supabase/migrations/`. Apply on prod via the Supabase Management API; do **not** rely on local psql (IPv6-only / not routable).

### 8. Quality bar before "done"
- **Test coverage** ≥ a defined threshold; precommit runs `npm test`. Fill out missing component tests for sidebar, daily-plan, email-work-list.
- **Accessibility pass** (keyboard-only flow through Today, Email Inbox, project view).
- **Performance** — Lighthouse green on Today and Email Inbox; bundle audit.
- **Docs:** keep `docs/roadmap.md`, this file, and Forge in sync. Don't bury decisions in commit messages alone.

---

## How to keep this in sync

- When adding a task in this session, mirror it to Forge under project `83239d6d-…` via the `/focus-forge` skill (or the API helper at `~/.claude/skills/focus-forge/scripts/forge-mobile-api.mjs`).
- When marking done in code, also tick the Forge task closed (the helper script lacks a "complete" verb — close from the UI for now; see open enhancement to the helper).
- Append/edit sections here on scope changes — don't let it drift into a stale wishlist.
