# Focus Forge — Web vs iOS Feature Parity Manifest

Last updated: 2026-09-02
Web ref: `focus-forge-web/web-app/app/[view]/view-client.tsx`, `components/*`
iOS ref: `focus-forge-ios-app/native/FocusForge/Features/*` (canonical `native/`, not `.claude/worktrees/*`)
Email-specific detail already tracked in `focus-forge-web/docs/ios-email-feature-parity-status.md` (62-item matrix, mostly ✅) — summarized here as one row.

| Feature | Web | iOS | Notes/Gap |
|---|:---:|:---:|---|
| Today / task list, task CRUD | ✅ | ✅ | `TodayView.swift`, `TaskEditorView.swift` |
| Projects list + detail | ✅ | ✅ | `ProjectsView.swift` (633 lines) |
| Sections / task lists within project | ✅ | ✅ | `TaskListEditorView.swift` |
| Goals (project goals) | ✅ `add-goal-modal.tsx`, `edit-goal-modal.tsx`, `goal-group.tsx` | ❌ | No goal model/view anywhere in iOS Swift tree |
| Ungrouped tasks / rollups | ✅ `rollup-subtotal.tsx` | ⚠️ | No dedicated rollup UI found |
| Organizations (multi-org switch, settings) | ✅ `add-organization-modal.tsx`, `organization-settings-modal.tsx` | ❌ | No org concept in iOS models/views |
| Kanban board | ✅ `kanban-view.tsx` | ❌ | Not present |
| Domino (board/gantt/filters) | ✅ `domino-board.tsx`, `domino-gantt.tsx`, `domino-filters.tsx` | ❌ | Not present |
| Email inbox / triage / spam / rules / AI reply | ✅ | ✅ (~55/62 done) | See companion doc; gaps: OAuth mailbox add (server missing), spam-scan progress endpoint, attachment download |
| Contacts (personal + org, import) | ✅ `email-contacts-view.tsx` | ❌ | Not present |
| AI assistant / chat | ✅ `ai-planner-floating-chat.tsx` | ✅ | `AssistantChatView.swift`, on-device + server engine |
| AI decision history / memory / playbook / rules tabs | ✅ `ai-decision-history-tab.tsx`, `ai-memory-tab.tsx`, `ai-playbook-tab.tsx`, `ai-rules-tabs.tsx` | ❌ | No equivalent surfaces |
| AI task refinement / estimate review | ✅ `ai-task-refinement-modal.tsx`, `estimate-review-modal.tsx`, `estimates-view.tsx` | ❌ | Not present |
| Project share (public link) | ✅ `project-share-modal.tsx`, `app/share/[token]` | ❌ | No share flow in iOS |
| Project progress timeline / history scrubber | ✅ `project-progress-timeline.tsx`, `history-timeline-scrubber.tsx` | ❌ | Not present |
| Trash / soft-delete recovery | ✅ `app/trash` | ❌ | Not present |
| Tags | ✅ `add-tag-modal.tsx` | ⚠️ | No dedicated tag UI found in iOS |
| Bulk edit | ✅ `bulk-edit-modal.tsx` | ❌ | Not present |
| Todoist sync | ✅ `todoist-integration.tsx`, `todoist-settings.tsx`, sync modals | ❌ | Not present |
| Time tracking | ✅ `time-tracking-view.tsx` | ❌ | Not present |
| Plans (daily plan / plan panel) | ✅ `plan-panel.tsx`, `daily-plan-card.tsx` | ✅ | `PlanListView.swift`, `PlanEditorView.swift`, `PlanExport.swift` |
| Search (global) | ✅ | ✅ | `SearchView.swift` — web has advanced query syntax; iOS search scope unverified in depth |
| Settings | ✅ `app/settings` (theming, integrations, org, AI providers) | ⚠️ | `SettingsView.swift` is 50 lines — minimal vs. web's multi-panel settings |
| Auth (sign in, account link) | ✅ | ✅ | `SignInView.swift`, `AccountLinkView.swift` |
| Push notifications | ✅ browser push | ✅ | APNs via `PushNotificationCoordinator` |
| Theme picker / theme modes | ✅ `theme-picker.tsx`, `theme-mode-toggle.tsx` | ⚠️ | `FocusForgeTheme.swift` exists but no user-facing picker view found |
| Reorganize misfiled tasks (new, this session) | 🚧 in progress on web | ❌ | Brand new web feature; iOS has no equivalent yet — track once web ships |

## iOS parity gaps — prioritized

1. **Organizations** — iOS has no multi-org model at all; every other gap below is scoped per-org on web, so this is the structural blocker.
2. **Goals** — core planning feature on web (goal-group, add/edit-goal modals) entirely absent on iOS.
3. **AI decision history / memory / playbook / rules panels** — web's AI system has 4 dedicated tabs; iOS only has the chat assistant, none of the transparency/control surfaces.
4. **Project share + Trash** — both are one-way-door user actions (publish a link, recover a delete) that only exist on web today.
5. **Kanban / Domino views, Todoist sync, bulk edit, time tracking, tags** — all zero-coverage on iOS; lower priority than the above since Today/Projects/Plans/Email cover the core daily workflow already.

Email is the most mature ported surface (~89% done per the dedicated matrix); everything else outside Today/Projects/Plans/Search/Auth is largely unbuilt on iOS.
