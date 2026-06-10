# iOS Email Feature Parity Spec

> **Purpose:** This document is the source-of-truth feature inventory for porting the web app's two email surfaces to the iOS app. Hand this file to the iOS agent. It lists every user-facing feature, where it lives in the web codebase, and notes on behavior so the iOS implementation matches.

**Web source files (reference implementations):**
- Email Inbox: `web-app/components/email-inbox-view.tsx`
- Today › Email Work: `web-app/components/email-work-list.tsx`
- Shared thread modal: `web-app/components/email-thread-modal.tsx`
- Spam review modal: `web-app/components/email-spam-review-modal.tsx`

**Two surfaces to build on iOS:**
1. **Email Inbox** — the full-featured email client (its own tab/screen).
2. **Today › Email Work** — a lightweight triage list embedded in the Today screen.

Legend: ✅ in this surface · ❌ not in this surface · ⚠️ partial/different.

---

## Feature Matrix

| # | Feature | Inbox | Today › Email Work | iOS Notes |
|---|---------|:---:|:---:|---|
| **List & display** ||||
| 1 | Email/thread list (scrollable) | ✅ | ✅ | Core list view. |
| 2 | Unread/read visual state (bold + tint) | ✅ | ✅ | Unread = bold, lighter; read = dimmed. |
| 3 | Unread/total count badges | ✅ | ❌ | "X / Total" with tooltip. |
| 4 | Context-specific empty states | ✅ | ✅ | Inbox varies by folder; Today: "No email work is waiting in Today." |
| 5 | Selected-item highlight | ✅ | ✅ | |
| 6 | Unread gradient (profile color) | ❌ | ✅ | Today rows tint unread with profile color gradient. |
| **Metadata per row** ||||
| 7 | Sender (From) w/ avatar + tooltip | ✅ | ✅ | Clickable; Today click filters by sender. |
| 8 | Recipient (To) display | ✅ | ✅ | Accent-colored mailbox name; tooltip = full address. |
| 9 | CC line | ⚠️ detail only | ✅ | Today shows CC inline when present. |
| 10 | Date **and** time per row | ⚠️ date | ✅ | Format e.g. "Jun 2, 2:13 PM"; older years "Jun 2 '25, 2:13 PM". |
| 11 | Subject line (normalized/untitled) | ✅ | ✅ | |
| 12 | AI summary text (sparkle icon) | ✅ | ✅ | Hides when duplicate of subject. |
| 13 | Email preview/excerpt (HTML cleaned) | ✅ | ✅ | |
| 14 | AI confidence score badge | ✅ | ✅ | e.g. "87% confidence". |
| 15 | Mailbox badge (deterministic color) | ✅ | ✅ | HSL from mailbox id; initials. |
| 16 | Spam/quarantine badge (skull icon) | ✅ | ✅ | |
| **Sort & filter** ||||
| 17 | Sort dropdown | ✅ 5 modes | ⚠️ 2 modes | Inbox: date, sender, subject, confidence. Today: newest/oldest. |
| 18 | Filter tabs/dropdown | ✅ | ✅ | Inbox: All/Unread/Read/Spam. Today: by classification (actionable, newsletter, waiting, reference, spam, unknown). |
| 19 | Full-text search | ✅ | ❌ | Sender, subject, preview, mailbox. |
| 20 | Advanced search syntax (16+ prefixes) | ✅ | ❌ | from:, to:, subject:, body:, project:, mailbox:, is:, has:, received:, before:, after:, id:, etc. |
| 21 | Search help modal + inline /help | ✅ | ❌ | |
| 22 | Mailbox selector/filter | ✅ | ❌ | All vs single mailbox. |
| 23 | Collapsible filter bar (persisted) | ✅ | ❌ | |
| **Sync** ||||
| 24 | Manual refresh/sync (spinner) | ✅ | ✅ | Today syncs all "due" mailboxes. |
| 25 | Last-sync indicator (relative) | ✅ | ✅ | "3m ago", "never", etc. |
| 26 | Mailboxes modal (per-box status + errors) | ⚠️ config form | ✅ | Today: list of boxes, last sync, error, "Refresh all". |
| 27 | Auto-sync polling (~30s) | ✅ | ❌ | |
| **Thread actions** ||||
| 28 | Convert email → task(s) | ✅ generate | ✅ | Today: wand icon hover action. |
| 29 | Snooze (date picker popover) | ❌ | ✅ | Defer to later. |
| 30 | Delete / move to trash | ✅ | ✅ | Configurable undo timeout. |
| 31 | Archive | ✅ | ❌ | |
| 32 | Approve / Quarantine | ✅ | ⚠️ quarantine only | |
| 33 | Mark spam / Not spam (+ rule gen) | ✅ | ❌ | |
| 34 | Mark as read toggle | ✅ | ❌ | |
| 35 | Queued action + undo toast | ✅ | ✅ | 3s default, 30s for delete. |
| 36 | Hover/swipe action buttons | ✅ | ✅ | On iOS use swipe actions. |
| **Thread detail** ||||
| 37 | Inline split-pane detail | ✅ | ❌ | Desktop XL; on iOS use push/modal nav. |
| 38 | Thread modal / popout | ✅ | ✅ | Today opens read-only modal. |
| 39 | Full conversation history | ✅ | ✅ | All messages, author avatars, timestamps. |
| 40 | Attachments list + previews | ✅ | ⚠️ modal | |
| 41 | HTML render mode toggle (preserve/simplified) | ✅ | ❌ | |
| 42 | Resizable detail panel | ✅ | ❌ | N/A on iOS. |
| **Compose / reply** ||||
| 43 | Reply / Reply-all rich editor | ✅ | ❌ | |
| 44 | Internal note mode | ✅ | ❌ | |
| 45 | AI reply generation (style/tone overrides) | ✅ | ❌ | Conciseness, tone, personality. |
| 46 | Schedule reply (date/time) | ✅ | ❌ | |
| 47 | Signature picker | ✅ | ❌ | |
| 48 | Reply attachments (upload/drag-drop, inline toggle) | ✅ | ❌ | |
| 49 | New outbound email composer | ✅ | ❌ | |
| 50 | Reply queue (draft/scheduled/failed/sent) | ✅ | ❌ | With per-draft confidence/rationale/error. |
| **Project & tasks** ||||
| 51 | Project picker / link (searchable) | ✅ | ✅ | Color dot, current project, checkmark. |
| 52 | Inline project creation | ✅ | ✅ | "+ Add New Project". |
| 53 | Linked tasks counter/list | ✅ | ✅ | |
| 54 | Linked tasks modal | ❌ | ✅ | "Tasks generated from <subject>". |
| **AI / rules** ||||
| 55 | AI summary on-hover vs always toggle | ✅ | ✅ | |
| 56 | Email excerpt on-hover vs always toggle | ✅ | ✅ | |
| 57 | Spam review modal | ✅ | ✅ | EmailSpamReviewModal. |
| 58 | AI spam scan w/ progress bar | ✅ | ❌ | Position X of Y, detected count. |
| 59 | Email rules panel/editor | ✅ | ❌ | |
| 60 | AI profiles (Email AI Lab) | ✅ | ❌ | Per-mailbox summary style + instructions. |
| 61 | Sender history modal | ✅ | ❌ | |
| **Notifications** ||||
| 62 | Browser/push notifications on new mail | ✅ | ❌ | iOS: use APNs push instead. |

---

## Build order recommendation for iOS

1. **Shared data layer** — mailboxes, threads, inbox fetch, thread detail, sync endpoints. Both surfaces depend on it.
2. **Today › Email Work list** (smaller surface) — list, metadata row (incl. date+time, CC), sort/filter, sync + mailbox modal, snooze/convert/delete swipe actions, project picker, linked-tasks modal, read-only thread modal.
3. **Email Inbox** (full client) — list + detail nav, search (basic then advanced syntax), folders (inbox/quarantine/trash/sent), all thread actions, compose/reply incl. AI + scheduling, reply queue, rules, AI profiles, push notifications.

Each numbered feature above maps to a tracked task; see the project task list for completion details.
