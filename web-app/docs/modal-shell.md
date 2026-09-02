# Modal shell: drag / resize / minimize / close

Every modal already shares one hook, `useModalWindow` (`components/ui/modal-window.tsx`), which
now provides the full window-shell behavior:

- **Drag** — `dragHandleProps` on a strip across the header.
- **Resize** — `resizeHandleProps` (spread via `<ModalResizeHandle handleProps={...} />`) on a
  bottom-right grip; `sizeStyle` overrides the panel's default `max-w-*`/`max-h-*` once resized.
- **Minimize** — `minimize()` + `<ModalMinimizeButton onMinimize={...} />`, collapses into the
  shared dock (bottom-right of the viewport) and restores with state intact.
- **Close** — existing `onClose`/`DialogPrimitive.Close`, unchanged.
- **25px viewport inset** — `MODAL_INSET_CLASS` (`inset-[25px]`) on the outer `fixed` overlay,
  replacing `inset-0`. Panels still center inside that inset and can be dragged/resized beyond it.

## Converted

- `components/ui/dialog.tsx` — the shared Radix `Dialog`/`DialogContent` primitive. Every modal
  built on it (confirm dialogs, etc.) gets resize + 25px inset automatically, no per-modal change
  needed.
- `components/organization-settings-modal.tsx` (Settings)
- `components/task-modal.tsx`
- `components/add-project-modal.tsx`
- `components/add-section-modal.tsx`
- `components/project-share-modal.tsx`

## To convert a remaining hand-rolled modal (e.g. `edit-project-modal.tsx`,
`add-organization-modal.tsx`, `add-goal-modal.tsx`, `edit-goal-modal.tsx`,
`add-tag-modal.tsx`, `bulk-edit-modal.tsx`, `email-*-modal.tsx`, `quarantine-rules-modal.tsx`,
`sender-history-modal.tsx`, `estimate-*-modal.tsx`, `inbox-tab-modal.tsx`,
`nav-tasks-modal.tsx`, `todoist-*-modal.tsx`, `agent-intro-modal.tsx`,
`ai-task-refinement-modal.tsx`, `drag-to-tab-modal.tsx`)

These all already call `useModalWindow` and spread `dragHandleProps` + render
`ModalMinimizeButton`. Three mechanical edits finish the conversion:

1. Import `MODAL_INSET_CLASS` and `ModalResizeHandle` alongside the existing
   `ModalMinimizeButton` / `useModalWindow` import.
2. Swap the outer overlay's `"fixed inset-0 ..."` for `` `fixed ${MODAL_INSET_CLASS} ...` ``, and
   drop any fixed `max-h-[90vh]` on the panel in favor of `max-h-full` (the inset now bounds it).
3. On the panel `<div>`: add `ref={modalWindow.panelRef}`, merge `...modalWindow.sizeStyle` into
   its inline `style`, and render `<ModalResizeHandle handleProps={modalWindow.resizeHandleProps} />`
   next to the existing `<ModalMinimizeButton />`.

`confirm-modal.tsx` and `edit-task-modal.tsx`/`add-task-modal.tsx` (thin wrappers around
`task-modal.tsx`/`ConfirmDialog`) don't need separate changes — they inherit from
`task-modal.tsx` or `components/ui/dialog.tsx` already.
