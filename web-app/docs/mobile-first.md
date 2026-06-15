# Focus: Forge Web — Mobile-First UI/UX Audit & Remediation Plan

_Last updated: 2026-06-15_

Focus: Forge Web is a dark-themed task / project / email app (Next.js App Router
+ React + Tailwind). It is currently **desktop-first**: most layouts assume a
wide viewport, responsive Tailwind prefixes (`sm: md: lg: xl:`) are sparse, and
several core surfaces (Email Inbox split panel, sidebar, hover-only row actions)
are unusable or heavily degraded on a phone.

This document is the remediation plan. Each item lists the file(s), why it's a
mobile problem, the recommended fix, and a priority:

- **P0** — broken / unusable on mobile
- **P1** — significant friction
- **P2** — polish

A companion set of Forge tasks (project **Focus: Forge Web**) is created from the
items below.

---

## Cross-cutting foundations (do these first)

### F1 — Add an explicit responsive viewport + safe-area config (P1)
**File:** `app/layout.tsx`
No explicit `viewport` is exported. Set:
```ts
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // enables env(safe-area-inset-*) on notch devices
};
```
Unlocks safe-area insets used by several fixes below.

### F2 — Add a shared `useIsMobile()` / breakpoint hook (P1)
**Files:** new `hooks/use-is-mobile.ts`, consumed app-wide
There is currently **no** mobile-detection hook (`useMediaQuery`, `useIsMobile`,
`matchMedia` are all absent). A single SSR-safe `matchMedia` hook lets panels,
modals, popovers, and tooltips branch on `md`/`xl` instead of each component
re-deriving it. Prerequisite for #1, #3, #8, #14.

### F3 — Adopt mobile-first Tailwind conventions (P2)
**Files:** project-wide
Only ~59 responsive-prefix usages across 77 component files; styling is
desktop-first (`md:px-4 px-2`). Flip to mobile-first base + `md:`/`lg:`
overrides. Bake the sizing tokens from #5–#7 and #17 into `ui/*` primitives so
new components inherit them.

---

## Email Inbox (highest-impact area)

### 1 — Email Inbox detail becomes a full-screen modal on mobile (P0)
**Files:** `components/email-inbox-view.tsx` (~1602–1609, 1661, 4212–4216),
`components/email-thread-modal.tsx`
The list+detail split layout only activates at `xl` (1280px). Below that the
detail panel (`min-width: 320px`) eats the whole viewport and stacks under the
list, so phone users scroll past the entire inbox to read a thread.
**Fix:** below `xl`, render the thread detail as a dedicated full-screen modal
with a back button; keep the split panel at `>= xl`. Branch on F2.

### 2 — Resizable right panel with persistent width (desktop) (P1)
**Files:** `components/email-inbox-view.tsx` (split-pane grid ~1602)
The detail panel wants a proper drag handle to resize, and the chosen width
should persist across logout and navigation (per-user setting, restored on
return). _(Tracked as a dedicated feature task.)_

### 3 — Setting: default percentage-based panel width on desktop (P1)
**Files:** settings surface + `email-inbox-view.tsx`
Add a user Setting for the Email Inbox right-panel default width as a % of
viewport on desktop, used as the initial width before any manual drag override.
_(Tracked as a dedicated feature task.)_

### 4 — Only render the resize divider in desktop split mode (P0, minor)
**File:** `components/email-inbox-view.tsx` (~1602–1609)
The 14px divider (`gridTemplateColumns: … 14px …`) is active on tablets
(768–1279px) where there isn't room to resize; dragging collapses the layout.
**Fix:** render the divider only when `isDesktopSplitLayout === true`.

### 5 — Email thread modal width breaks small phones (P1)
**File:** `components/email-thread-modal.tsx` (~1018, 1022)
Side-panel width `w-[max(480px,40vw)]` forces ≥480px; iPhone SE (375px) clips.
**Fix:** full-screen below `md` (`w-screen`/`max-w-[95vw]`), keep
`w-[min(96vw,52rem)]` at `md+`.

### 6 — Email filter/search bar doesn't stack on mobile (P2)
**File:** `components/email-inbox-view.tsx` (~4284–4298)
3-column grid (`lg:grid-cols-[…]`) crams search + mailbox + sort on phones.
**Fix:** `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`.

### 7 — Tag/filter popovers can overflow the viewport (P1)
**File:** `components/email-inbox-view.tsx` (~349–351)
Fixed `w-[260px]` popovers overflow a 375px screen.
**Fix:** `w-[min(260px,calc(100vw-2rem))]`, force `side="bottom"` on mobile.

### 8 — Dense email-row buttons / sub-40px touch targets (P1)
**Files:** `components/email-work-list.tsx` (~118, 1240, 1267, 1296),
`components/email-inbox-view.tsx` (~4276)
`px-1.5 py-0.5` + `text-[10px]/[11px]` produce <44px targets.
**Fix:** mobile-first sizing `h-12 md:h-10`, `gap-2 md:gap-1`,
`text-sm md:text-xs`.

---

## Navigation

### 9 — Mobile navigation drawer / hide sidebar by default (P1)
**File:** `components/sidebar.tsx` (~397, 656, 1346–1347)
Sidebar is always rendered, collapsing to `w-[60px]` — ~13% of a 375px phone —
with no hamburger/drawer. **Fix:** below `md`, hide by default behind a ≥44px
hamburger (slide-out drawer or bottom tab bar); keep persistent on desktop.

---

## Task List

### 10 — Hover-only row actions are invisible on touch (P1)
**File:** `components/task-list.tsx` (~556, 577, 758, 774, 860, 966, 1005, 1023,
1040, 1060, 1070, 1085, 1097, 1107)
Edit/delete/copy-id/date/dependency/email actions are `opacity-0
group-hover:opacity-100` / `hidden group-hover:block` — unreachable on touch.
**Fix:** always show below `md` (or swipe-to-reveal) and add
`group-focus-within:opacity-100` for keyboard access.

---

## Tables & wide content

### 11 — Time-tracking table has no mobile affordance (P1)
**File:** `components/time-tracking-view.tsx` (~863–937)
8-column table with `overflow-x-auto` but no scroll hint and no sticky context
column. **Fix:** sticky left (user) column, an edge scroll-shadow, and/or a card
layout below `md`.

---

## Shared primitives & modals

### 12 — Large modals aren't mobile sheets (P1)
**Files:** `components/email-spam-review-modal.tsx` (~416),
`components/email-inbox-view.tsx` (~3972, 5893, 6038), `email-thread-modal.tsx`
(~1022)
Fixed widths (`w-[min(96vw,920px)]`, up to 1440px) + `max-h-[92vh]` clip on short
viewports and force internal scroll. **Fix:** full-screen sheet below `md`
(`w-screen h-screen`, full-page scroll), safe-area padding; keep desktop sizes
at `md+`.

### 13 — Dialog base width not mobile-first (P2)
**File:** `components/ui/dialog.tsx` (~41)
Base `max-w-lg` forces every large modal to override. **Fix:** mobile-first base
(`w-[min(96vw,32rem)] sm:max-w-lg`) so modals inherit sane mobile widths.

### 14 — Input height below 44px (P2)
**File:** `components/ui/input.tsx` (~13) — `h-10`. **Fix:** `h-12 md:h-10`
(and guard iOS focus-zoom with ≥16px font on mobile inputs).

### 15 — Icon button below 44px (P2)
**File:** `components/ui/button.tsx` (~22–25) — `icon: h-10 w-10`.
**Fix:** `h-11 w-11 md:h-10 md:w-10`.

### 16 — Tooltips invisible on touch (P1)
**File:** `components/tooltip.tsx` (used app-wide)
Hover-only (`onMouseEnter/Leave`); touch users never see help text (e.g. the
search-help affordance). **Fix:** show on `focus-visible` and tap/long-press;
detect touch via F2.

### 17 — Sub-12px text in dense areas (P2)
**Files:** `email-work-list.tsx`, `email-inbox-view.tsx`, `task-list.tsx`
(`text-[10px]`/`text-[11px]` badges, dates, statuses). **Fix:** bump to ≥12px on
mobile (`text-xs sm:text-[10px]`).

### 18 — Floating chat button ignores safe-area insets (P2)
**File:** `components/ai-planner-floating-chat.tsx` (~339) — `fixed bottom-20
right-5` can hide behind the home indicator. **Fix:**
`bottom-[max(5rem,calc(env(safe-area-inset-bottom)+1.25rem))]` (needs F1).

---

## Suggested sequencing

1. **Foundations:** F1, F2 (then F3 incrementally).
2. **Quick wins:** #6, #13, #14, #15, #11.
3. **Touch correctness:** #10, #16, #8, #7.
4. **Navigation & modals:** #9, #12, #5, #4.
5. **Flagship:** #1 (Email Inbox mobile modal) + #2, #3 (resize + width setting).

## Priority rollup

| Priority | Items |
|----------|-------|
| **P0** | #1, #4 |
| **P1** | F1, F2, #2, #3, #5, #7, #8, #9, #10, #11, #12, #16 |
| **P2** | F3, #6, #13, #14, #15, #17, #18 |
