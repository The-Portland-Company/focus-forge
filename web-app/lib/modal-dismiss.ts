/**
 * Shared rule for "did this pointer event land outside the modal?".
 *
 * Extracted from the components so the awkward cases can be tested directly:
 * both bugs this replaced were in the edge cases, not the happy path.
 *
 * Duck-typed rather than taking real DOM nodes so it can be unit tested without
 * a DOM implementation.
 */

/** Layers that render outside the modal's subtree but are logically inside it. */
export const LAYERED_UI_SELECTOR = [
  "[data-radix-popper-content-wrapper]",
  "[data-radix-portal]",
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="listbox"]',
  '[role="menu"]',
].join(",");

export interface DismissEventTarget {
  /** False once a node has been detached from the document. */
  isConnected?: boolean;
  closest?: (selector: string) => unknown;
}

export interface DismissContainer {
  /** Accepts `any` so a real Element (contains(node: Node|null)) structurally matches. */
  contains: (node: any) => boolean;
}

/**
 * True when a pointer event should dismiss the modal.
 *
 * Two cases that look like "outside" but are not:
 *
 * 1. **The target is already detached.** React's listener runs on the root
 *    container before a listener on `document`, so an onMouseDown that
 *    unmounts what was clicked — picking an @-mention from a suggestion list,
 *    say — leaves a detached node by the time this runs. `contains()` is false
 *    for a detached node, which read as an outside click and closed the modal
 *    mid-interaction.
 *
 * 2. **The target is in a portalled layer.** Radix renders dialogs, popovers,
 *    selects and menus at the document root, outside the modal's subtree. The
 *    old check only allowed popper-based wrappers, so a nested confirm dialog —
 *    "Delete subtask?" — closed the whole task modal when clicked.
 */
export function shouldDismissOnOutsidePointer(
  target: DismissEventTarget | null | undefined,
  container: DismissContainer | null | undefined,
): boolean {
  if (!target) return false;
  if (target.isConnected === false) return false;
  if (container?.contains(target)) return false;
  if (
    typeof target.closest === "function" &&
    target.closest(LAYERED_UI_SELECTOR)
  ) {
    return false;
  }
  return true;
}
