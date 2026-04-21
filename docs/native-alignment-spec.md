# Focus Forge Native Alignment Spec

## Rule One
The web app is the source of truth. Native apps must mirror desktop semantics, labels, states, and workflows. Do not redesign the product on native. Preserve web behavior unless a native platform constraint makes a direct mirror impossible.

## Canonical Desktop Sources
- Main shell and feature routing: `web-app/app/[view]/page.tsx`
- Global navigation and section structure: `web-app/components/sidebar.tsx`
- Settings and admin surfaces: `web-app/app/settings/page.tsx`
- Focus Time docs and contract pages: `web-app/app/docs/focus-time-agent/page.tsx`, `web-app/app/docs/focus-time-openapi/page.tsx`
- Email workflow and inbox rules: `web-app/lib/email-inbox/*`

## 1. Source-Of-Truth Desktop Feature Inventory

### Auth And Session
- Email/password sign in, sign up, forgot password, reset password, invite accept.
- Session restore, logout, and account linking flows.

### Main Task Shell
- Today, Upcoming, Search, Favorites, orgs, projects, and task creation/editing.
- Task due date, deadline, priority, reminders, tags, files, subtasks, recurring tasks, assignment, blocked-task handling, undo complete, bulk actions, and drag/drop between sections.

### Project And Organization Workspace
- Org and project CRUD, archive/restore/delete, reorder, members/invites, role changes.
- Project notes, descriptions, section management, AI auto-sectioning, progress timeline, filters, and search.

### Email Inbox
- Inbox, quarantine, trash, sent, drafts, threads, rules, spam review, sender history, signatures, and attachment handling.
- AI-assisted reply drafting and rule creation.

### Focus Time
- Current timer controls, start/stop, edit session metadata, time entry history, filters, and API/docs contract pages.

### Calendar
- Time blocks, task scheduling into blocks, inline block editing, and calendar assistant surfaces.

### Settings And Admin
- Profile, memoji/color, theme, animation preference, email prefs, reply style, email HTML mode, delete-undo timing, Todoist connection/sync, personal tokens, calendar feed, org settings, member management, API keys.

### Developer And Documentation Surfaces
- Project AI export JSON, Focus Time prompt docs, OpenAPI docs, and related contract pages.

## 2. Styling And Theme Contract

### Visual Rule
- Native apps use Liquid Glass and follow system dark/light by default.
- Web keeps its current theme system. Native should mirror the same information hierarchy, not the same CSS.

### Color
- Primary accent comes from the product theme, but native renders it through Liquid Glass tints and system materials.
- Use system semantic colors for text, separators, destructive states, success, and disabled states.
- Respect current light/dark appearance automatically. No hard-coded dark-only shell.

### Spacing And Layout
- Keep density close to desktop. Use clear card grouping, 8pt-based spacing, and predictable vertical rhythm.
- Preserve semantic containers: sidebar, list, detail pane, modal/sheet, inspector, empty state, toolbar.
- Do not collapse content into decorative chrome. The structure must still read like the web app.

### Components
- Task rows: title first, metadata second, actions last.
- Sheets and dialogs: used for create/edit/detail, matching desktop modal behavior.
- Tabs and sidebars: use platform-native navigation, but keep the same section order and naming.
- Toggles, segmented filters, search, badges, chips, and list affordances should map 1:1 in meaning.

### Interaction Contract
- Keep the same verbs: create, edit, complete, archive, reorder, search, filter, send, draft, schedule, start, stop.
- Drag/drop should exist where desktop has it. If a platform cannot support it cleanly, provide the same outcome through explicit actions.
- Preserve undo where desktop exposes it.
- Loading, empty, blocked, and error states must say the same thing the web app says, even if visuals differ.

### Navigation Pattern
- Preserve the same global sections and order.
- iOS can stay tab-first where appropriate.
- macOS should favor sidebar plus detail layout when the screen allows it.
- Native navigation can be more platform-correct, but the destination map must match web.

## 3. Parity Roadmap

### iOS Priority Order
1. Settings/profile/admin hub.
2. Org/project CRUD and richer project detail.
3. Rich task editing: tags, reminders, attachments, recurrence, assignment, blocked tasks.
4. Favorites, better search/filtering, and bulk task actions.
5. Focus Time and calendar surfaces.
6. Email inbox workflow where mobile value justifies it.

### macOS Priority Order
1. Full desktop shell with sidebar navigation and multi-pane layout.
2. Task, project, and org parity with drag/drop and inspector-style editing.
3. Email inbox, Focus Time, and calendar parity.
4. Settings/admin parity.
5. Power-user affordances: keyboard-first flow, bulk actions, and faster navigation.

### Shared Execution Rules
- Build the shared feature model first, then platform shells, then feature parity.
- Reuse the same naming, icons, and hierarchy across native apps.
- Keep web untouched unless a truth defect is found. If web changes are required, they must happen as a separate truth update, not a native-driven redesign.
- Native work should land only after the desktop behavior it mirrors is understood and documented here.

