"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Minus, X } from "lucide-react";

/**
 * Standard inset (px) between every modal panel and the viewport edges.
 * Apply via `MODAL_INSET_CLASS` on the fixed overlay wrapper.
 */
export const MODAL_INSET_PX = 25;
export const MODAL_INSET_CLASS = "inset-[25px]";

/**
 * Shared drag + minimize behaviour for every modal in the app.
 *
 * Two modal families exist here: dialogs built on `components/ui/dialog`
 * (Radix) and hand-rolled `fixed inset-0` overlays. Both consume this hook so
 * dragging and minimizing behave identically no matter which one a screen uses.
 *
 * Dragging is pointer-based and offset-only: the panel keeps whatever centering
 * its own layout uses and this adds a translate on top, so nothing needs to
 * know its own size or position. The offset is clamped on release so a window
 * can never be dragged fully off-screen and stranded.
 *
 * Minimizing keeps the modal's React component mounted — only its DOM is
 * hidden — so every field, scroll position and in-flight edit survives. The
 * minimized windows collect in a single dock (bottom-right); clicking one
 * restores it, and each entry can be closed straight from the dock.
 */

type MinimizedEntry = {
  id: string;
  title: string;
  restore: () => void;
  close?: () => void;
};

// Module-level store so every minimized modal, from either family, lands in one
// dock rather than each modal rendering its own floating bar.
let dockEntries: MinimizedEntry[] = [];
const dockListeners = new Set<() => void>();

function emitDock() {
  dockEntries = [...dockEntries];
  dockListeners.forEach((listener) => listener());
}

function subscribeDock(listener: () => void) {
  dockListeners.add(listener);
  return () => {
    dockListeners.delete(listener);
  };
}

function addDockEntry(entry: MinimizedEntry) {
  dockEntries = [...dockEntries.filter((e) => e.id !== entry.id), entry];
  emitDock();
}

function removeDockEntry(id: string) {
  const next = dockEntries.filter((entry) => entry.id !== id);
  if (next.length === dockEntries.length) return;
  dockEntries = next;
  emitDock();
}

const EMPTY_ENTRIES: MinimizedEntry[] = [];

export function useMinimizedModals() {
  return React.useSyncExternalStore(
    subscribeDock,
    () => dockEntries,
    () => EMPTY_ENTRIES,
  );
}

export type ModalWindowOptions = {
  /** Shown in the minimized dock. */
  title: string;
  /** Whether the modal is currently open; closing resets drag + minimize. */
  open?: boolean;
  /** Lets the dock close a minimized modal without restoring it first. */
  onRequestClose?: () => void;
  /** Set false for modals that shouldn't be minimizable (confirmations). */
  minimizable?: boolean;
};

export function useModalWindow({
  title,
  open = true,
  onRequestClose,
  minimizable = true,
}: ModalWindowOptions) {
  const id = React.useId();
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const [dragging, setDragging] = React.useState(false);
  const [minimized, setMinimized] = React.useState(false);
  const dragOriginRef = React.useRef<{
    pointerX: number;
    pointerY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const [size, setSize] = React.useState<{
    width: number | null;
    height: number | null;
  }>({ width: null, height: null });
  const [resizing, setResizing] = React.useState(false);
  const resizeOriginRef = React.useRef<{
    pointerX: number;
    pointerY: number;
    width: number;
    height: number;
  } | null>(null);

  // A closed modal starts fresh next time: centered, default size, not minimized.
  React.useEffect(() => {
    if (open) return;
    setOffset({ x: 0, y: 0 });
    setMinimized(false);
    setDragging(false);
    setSize({ width: null, height: null });
    setResizing(false);
    removeDockEntry(id);
  }, [id, open]);

  React.useEffect(() => () => removeDockEntry(id), [id]);

  const restore = React.useCallback(() => {
    setMinimized(false);
    removeDockEntry(id);
  }, [id]);

  const minimize = React.useCallback(() => {
    if (!minimizable) return;
    setMinimized(true);
    addDockEntry({
      id,
      title,
      restore: () => {
        setMinimized(false);
        removeDockEntry(id);
      },
      close: onRequestClose,
    });
  }, [id, minimizable, onRequestClose, title]);

  // Keep the dock label in sync while minimized (e.g. a composer's subject).
  React.useEffect(() => {
    if (!minimized) return;
    addDockEntry({
      id,
      title,
      restore: () => {
        setMinimized(false);
        removeDockEntry(id);
      },
      close: onRequestClose,
    });
  }, [id, minimized, onRequestClose, title]);

  const onDragPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      // Left button / touch only, and never when the press started on a
      // control (button, input, link) inside the drag strip.
      if (event.button !== 0) return;
      const target = event.target as HTMLElement;
      if (target.closest("button, a, input, textarea, select, [role='button']")) {
        return;
      }
      dragOriginRef.current = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        offsetX: offset.x,
        offsetY: offset.y,
      };
      setDragging(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [offset.x, offset.y],
  );

  const onDragPointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const origin = dragOriginRef.current;
      if (!origin) return;
      setOffset({
        x: origin.offsetX + (event.clientX - origin.pointerX),
        y: origin.offsetY + (event.clientY - origin.pointerY),
      });
    },
    [],
  );

  const endDrag = React.useCallback(() => {
    if (!dragOriginRef.current) return;
    dragOriginRef.current = null;
    setDragging(false);
    // Clamp so at least part of the window stays reachable on screen.
    setOffset((current) => {
      if (typeof window === "undefined") return current;
      const maxX = Math.max(0, window.innerWidth / 2 - 80);
      const maxY = Math.max(0, window.innerHeight / 2 - 60);
      return {
        x: Math.min(Math.max(current.x, -maxX), maxX),
        y: Math.min(Math.max(current.y, -maxY), maxY),
      };
    });
  }, []);

  const dragHandleProps = {
    onPointerDown: onDragPointerDown,
    onPointerMove: onDragPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    // The strip must sit *behind* the header content, not on top of it. If it
    // floats above (its class is `z-0`, which paints a positioned element over
    // in-flow siblings), it swallows every pointer press in the top strip — so
    // clicking a close/minimize button that lives in normal flow lands on the
    // invisible strip and starts a drag instead of closing. `zIndex: -1` (inline,
    // so it wins over the `z-0` class) drops it below the content while keeping it
    // above the panel's own background, so empty header space still initiates a
    // drag. This only stays contained to the panel because `panelStyle` /
    // `centeredPanelStyle` below make every panel its own stacking context.
    style: {
      cursor: dragging ? "grabbing" : "grab",
      touchAction: "none",
      zIndex: -1,
    },
  } as const;

  // Resizing: grabbed from the panel's own measured size (via panelRef) so it
  // works no matter how the panel is sized by default (max-w-*, intrinsic, …).
  const onResizePointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      const rect = panelRef.current?.getBoundingClientRect();
      if (!rect) return;
      resizeOriginRef.current = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        width: rect.width,
        height: rect.height,
      };
      setResizing(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
      // Don't let the resize press bubble into the drag strip.
      event.stopPropagation();
    },
    [],
  );

  const onResizePointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const origin = resizeOriginRef.current;
      if (!origin) return;
      const minWidth = 320;
      const minHeight = 200;
      const maxWidth =
        typeof window !== "undefined"
          ? window.innerWidth - MODAL_INSET_PX * 2
          : Infinity;
      const maxHeight =
        typeof window !== "undefined"
          ? window.innerHeight - MODAL_INSET_PX * 2
          : Infinity;
      setSize({
        width: Math.min(
          Math.max(origin.width + (event.clientX - origin.pointerX), minWidth),
          maxWidth,
        ),
        height: Math.min(
          Math.max(origin.height + (event.clientY - origin.pointerY), minHeight),
          maxHeight,
        ),
      });
    },
    [],
  );

  const endResize = React.useCallback(() => {
    if (!resizeOriginRef.current) return;
    resizeOriginRef.current = null;
    setResizing(false);
  }, []);

  const resizeHandleProps = {
    onPointerDown: onResizePointerDown,
    onPointerMove: onResizePointerMove,
    onPointerUp: endResize,
    onPointerCancel: endResize,
    style: { touchAction: "none", cursor: "nwse-resize" } as const,
  } as const;

  // Merge into a panel's inline style once a manual size has been set;
  // overrides whatever max-w-*/max-h-* className the panel normally uses.
  const sizeStyle = size.width
    ? ({
        width: size.width,
        height: size.height ?? undefined,
        maxWidth: "none",
        maxHeight: "none",
      } as const)
    : ({} as const);

  const dragged = offset.x !== 0 || offset.y !== 0;

  return {
    id,
    minimized,
    minimize,
    restore,
    minimizable,
    dragging,
    dragged,
    offset,
    dragHandleProps,
    panelRef,
    resizing,
    resizeHandleProps,
    sizeStyle,
    /**
     * Offset transform for a panel that is NOT centred by transform.
     * `isolation: isolate` makes the panel a stacking context even when it is
     * not being dragged, so the drag strip's negative z-index stays behind the
     * panel's content rather than escaping to the overlay and vanishing behind
     * the whole panel.
     */
    panelStyle: dragged
      ? ({
          transform: `translate(${offset.x}px, ${offset.y}px)`,
          isolation: "isolate",
        } as const)
      : ({ isolation: "isolate" } as const),
    /** Offset transform for a panel centred with -translate-x/y-1/2. */
    centeredPanelStyle: dragged
      ? ({
          transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
          isolation: "isolate",
        } as const)
      : ({ isolation: "isolate" } as const),
  };
}

/** Minimize button, styled to sit beside a modal's close button. */
export function ModalMinimizeButton({
  onMinimize,
  className = "",
}: {
  onMinimize: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onMinimize}
      aria-label="Minimize"
      title="Minimize"
      className={`rounded-sm text-zinc-400 opacity-70 transition-opacity hover:text-white hover:opacity-100 focus:outline-none ${className}`}
    >
      <Minus className="h-4 w-4" />
    </button>
  );
}

/**
 * Bottom-right resize grip. Spread `resizeHandleProps` from `useModalWindow`
 * onto it; drag to resize the panel it's anchored inside of.
 */
export function ModalResizeHandle({
  handleProps,
  className = "",
}: {
  handleProps: ReturnType<typeof useModalWindow>["resizeHandleProps"];
  className?: string;
}) {
  return (
    <div
      {...handleProps}
      role="presentation"
      aria-hidden
      className={`absolute bottom-0 right-0 z-20 h-5 w-5 touch-none ${className}`}
    >
      <svg
        viewBox="0 0 16 16"
        className="pointer-events-none absolute bottom-0.5 right-0.5 h-3 w-3 text-zinc-600"
        fill="currentColor"
      >
        <circle cx="13" cy="13" r="1.3" />
        <circle cx="13" cy="8" r="1.3" />
        <circle cx="8" cy="13" r="1.3" />
      </svg>
    </div>
  );
}

/**
 * The dock of minimized windows. Mounted once from the app shell; renders
 * nothing until something is minimized.
 */
export function MinimizedModalDock() {
  const entries = useMinimizedModals();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  if (!mounted || entries.length === 0) return null;

  return createPortal(
    <div className="pointer-events-none fixed bottom-4 right-4 z-[200] flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="pointer-events-auto flex max-w-full items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 shadow-xl"
        >
          <button
            type="button"
            onClick={entry.restore}
            className="min-w-0 truncate text-sm text-zinc-100 hover:text-white"
            title={`Restore ${entry.title}`}
          >
            {entry.title}
          </button>
          {entry.close ? (
            <button
              type="button"
              onClick={() => {
                entry.restore();
                entry.close?.();
              }}
              aria-label={`Close ${entry.title}`}
              title="Close"
              className="shrink-0 rounded-md border border-zinc-700 bg-zinc-950 p-1 text-zinc-400 transition-colors hover:border-zinc-600 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      ))}
    </div>,
    document.body,
  );
}
