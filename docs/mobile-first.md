# Focus: Forge Web — Mobile-First UI/UX Audit & Remediation Plan

_Audited: 2026-06-15. Scope: `web-app/app` (routes) and `web-app/components`._

## Intro

Focus: Forge's project charter (`web-app/CLAUDE.md`) states the app is "mobile-first" and that responsive design is "completed." In practice the codebase is **desktop-first**: it ships a permanently-visible sidebar with no mobile drawer, multiple fixed-pixel panels/modals that exceed phone widths, multi-column boards and 7-column data tables with no small-screen layout, and core interactions (drag-to-reorder, hover-to-reveal action menus) that have **no touch equivalent**. Only ~85 Tailwind responsive breakpoint utilities exist across the entire app — far too few for a genuinely mobile-first product.

This document lists the concrete findings (with file references) and a prioritized P1/P2/P3 remediation plan. None of the app code was modified during this audit.

## Findings

| Area | Issue | Severity | Recommendation |
|---|---|---|---|
| Navigation shell (`components/sidebar.tsx:1346`) | Sidebar is always rendered (`w-[60px]` collapsed / ~220px expanded). No `hidden md:block`, no hamburger, no off-canvas drawer. Consumes scarce phone width permanently. | 🔴 Critical | Add a mobile hamburger + slide-in drawer; render sidebar `hidden md:flex` and overlay it on small screens. |
| Hover-only menus (`components/sidebar.tsx:1651,1868`; `nav-tasks-modal.tsx:476`; `email-work-list.tsx:2173`) | Org/project action menus and content loading are revealed only via `onMouseEnter`. Touch users cannot access them. | 🔴 Critical | Make actions tap-accessible (always-visible affordance, long-press, or kebab menu); preload content without hover. |
| Kanban board (`components/kanban-view.tsx:166`) | Columns are `w-[20%] min-w-[300px]` inside a horizontal scroller — only one column fits a 375px phone. | 🔴 Critical | Use `w-full md:w-[20%] md:min-w-[300px]` so columns stack/full-width on mobile. |
| Drag-and-drop reorder (`kanban-view.tsx`, `sidebar.tsx`, `project-section-board.tsx:230`, `task-list.tsx:548`, `calendar/page.tsx:194`) | All reordering/scheduling uses native `draggable` + mouse drag events. No touch DnD or fallback move UI. | 🟠 High | Adopt a pointer/touch-capable DnD lib (e.g. dnd-kit) or add explicit "move up/down / assign" controls for touch. |
| Email thread panel (`components/email-thread-modal.tsx:1018,1020`) | Desktop drawer `w-[max(480px,40vw)]` overflows phones <480px; mobile bottom-sheet fixed at `h-[50vh]` is too short for reading. | 🟠 High | Full-width on mobile; make sheet height flexible/expandable with internal scroll. |
| Large modals (`email-inbox-view.tsx:3972,5893,6038`; `email-spam-review-modal.tsx:416`) | Modals sized 920–1440px (capped at 96vw). Internal layouts are desktop-grid and don't reflow at phone widths. | 🟠 High | Reflow modal internals to single-column under `md:`; verify content fits at 375px. |
| Data tables (`time-tracking-view.tsx:255`; `calendar/page.tsx:255`; `estimates-view.tsx`; `ai-memory-tab.tsx:1010`) | 7-column tables rely on `overflow-x-auto` (or none); unreadable/cramped on phones. | 🟠 High | Provide a stacked card/list layout under `md:`; ensure every table has an overflow wrapper. |
| Multi-column work views (`project-section-board.tsx`, `email-inbox-view.tsx:3565`) | Side-by-side section/detail columns don't reduce column count on small screens, causing horizontal overflow. | 🟠 High | Collapse to single column under `lg:`; let detail panels become full-screen views on mobile. |
| Fixed-width popovers (`time-picker.tsx:320` `w-[320px]`; `ai-playbook-tab.tsx:233` `w-[220px]`; `view-client.tsx:260,269,281`) | Hardcoded px widths overflow narrow phones. | 🟡 Medium | Use `w-[min(96vw,Npx)]` / responsive max-widths. |
| Modal scroll safety (multiple `*-modal.tsx`) | Many modals set `max-h-[92vh]` but lack `overflow-y-auto` on the scrollable child, risking clipped content on short screens. | 🟡 Medium | Standardize a modal body wrapper with `max-h` + `overflow-y-auto`. |
| Viewport config (`app/layout.tsx`) | No `export const viewport`. Relies on Next.js default; no explicit `width=device-width`/scaling/safe-area control, and `appleWebApp` PWA mode benefits from explicit viewport-fit. | 🟡 Medium | Add a `viewport` export with `width: 'device-width', initialScale: 1, viewportFit: 'cover'`. |
| Tap targets / type scale (`email-work-list.tsx:2125` `text-[9px]`; various `h-4 w-4` controls) | Sub-readable text and small standalone icon controls below the ~44px touch guideline. | 🟡 Medium | Enforce ≥44px hit areas and ≥12px text on interactive elements. |
| Overall breakpoint coverage (app-wide) | Only ~85 `sm:`/`md:`/`lg:` utilities across the whole app — too sparse for mobile-first. | 🟠 High | Establish responsive layout conventions and a mobile test pass on every primary view. |

## Prioritized Remediation Plan

### P1 — Critical (blocks basic phone usage)

1. **Mobile navigation drawer + hamburger.** Render the sidebar `hidden md:flex` and add a hamburger-triggered slide-in drawer with backdrop for `<md` so the full screen width is usable on phones. (`components/sidebar.tsx`, app shell)
2. **Touch-accessible org/project/task action menus.** Replace `onMouseEnter`-gated action menus with always-visible or tap/long-press affordances (kebab menu) so touch users can reach archive/edit/delete and nav-task actions. (`sidebar.tsx`, `nav-tasks-modal.tsx`, `email-work-list.tsx`)
3. **Responsive Kanban columns.** Change column sizing to `w-full md:w-[20%] md:min-w-[300px]` so columns stack/full-width on phones instead of forcing a one-column horizontal scroll. (`components/kanban-view.tsx`)
4. **Touch-capable drag-and-drop (or fallback controls).** Migrate native `draggable` reordering/scheduling to a pointer/touch DnD library, or add explicit move/assign controls, across kanban, sidebar, section board, task list, and calendar. (`kanban-view.tsx`, `sidebar.tsx`, `project-section-board.tsx`, `task-list.tsx`, `calendar/page.tsx`)

### P2 — High (core flows degraded on mobile)

5. **Responsive email thread panel.** Make the thread view full-width on mobile and give the bottom-sheet a flexible/expandable height with internal scroll instead of the fixed `h-[50vh]`; drop the 480px desktop minimum on small screens. (`components/email-thread-modal.tsx`)
6. **Reflow large email modals for small screens.** Make the 920–1440px inbox/spam-review modals collapse their internal desktop grids to a single column under `md:` and verify usability at 375px. (`email-inbox-view.tsx`, `email-spam-review-modal.tsx`)
7. **Mobile-friendly data tables.** Add a stacked card/list rendering under `md:` for the 7-column time-tracking, calendar, estimates, and AI-memory tables, and ensure each table has an overflow wrapper. (`time-tracking-view.tsx`, `calendar/page.tsx`, `estimates-view.tsx`, `ai-memory-tab.tsx`)
8. **Single-column multi-panel work views.** Collapse side-by-side section/detail layouts to one column under `lg:`, with detail panels opening as full-screen views on mobile. (`project-section-board.tsx`, `email-inbox-view.tsx`)
9. **App-wide mobile layout pass + conventions.** Establish responsive layout conventions and do a documented phone (375px) test pass across every primary view, raising breakpoint coverage beyond the current ~85 utilities. (app-wide)

### P3 — Medium (polish & robustness)

10. **Fluid popover/select widths.** Replace hardcoded `w-[320px]`/`w-[220px]`/etc. popovers and selects with `w-[min(96vw,Npx)]` or responsive max-widths. (`time-picker.tsx`, `ai-playbook-tab.tsx`, `app/[view]/view-client.tsx`)
11. **Standardize scrollable modal bodies.** Introduce a shared modal-body wrapper with `max-h` + `overflow-y-auto` and apply it so no modal clips content on short screens. (`components/ui/dialog.tsx`, `*-modal.tsx`)
12. **Explicit viewport configuration.** Add an `export const viewport` to the root layout with `width: 'device-width'`, `initialScale: 1`, and `viewportFit: 'cover'` for correct scaling and PWA safe-area support. (`app/layout.tsx`)
13. **Touch target & type-scale audit.** Enforce ≥44px interactive hit areas and ≥12px text for tappable elements, fixing sub-readable badges/labels and small standalone icon buttons. (`email-work-list.tsx`, shared icon-button patterns)
