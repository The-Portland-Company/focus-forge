"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  GripHorizontal,
  Minus,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PanelTop,
  X,
} from "lucide-react";
import { useModalWindow } from "@/components/ui/modal-window";

/**
 * Reusable floating panel: drag by the header, minimize into the shared window
 * dock, and (optionally) dock to an edge of the viewport. Rendered in a portal
 * with no backdrop so the page underneath stays usable.
 *
 * Extracted from the spam explainability modal (PR #81) so the Linked Tasks
 * pop-out and any future floating panel share one drag implementation — fix a
 * drag bug once, not per panel.
 *
 * Positioning stays local: a panel is free-dragged to absolute coordinates or
 * pinned to an edge, which the modal hook's centre-plus-offset model does not
 * describe. Minimize is the shared part — a minimized panel goes to the same
 * dock as every modal rather than leaving an orphaned title bar floating over
 * the page, so there is one place to find anything you set aside.
 */

export type FloatingPanelDock = "left" | "right" | "top" | "bottom" | null;

export function FloatingPanel({
  title,
  icon,
  open,
  onClose,
  /** Resets position/minimized whenever this changes (e.g. a new thread id). */
  resetKey,
  /** Show the dock-left / dock-right buttons. */
  dockable = false,
  initialDock = null,
  widthClassName = "w-[min(36rem,92vw)]",
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  open: boolean;
  onClose: () => void;
  resetKey?: string | number | null;
  dockable?: boolean;
  initialDock?: FloatingPanelDock;
  widthClassName?: string;
  children: React.ReactNode;
}) {
  // `pos === null` renders centered (or docked); once dragged it is absolute.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dock, setDock] = useState<FloatingPanelDock>(initialDock);
  const { minimized, minimize, restore } = useModalWindow({
    title,
    open,
    onRequestClose: onClose,
  });
  const dragState = useRef<{
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
    w: number;
    h: number;
  } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setPos(null);
    restore();
    setDock(initialDock);
    // initialDock is a plain prop default; resetKey drives the reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const onDragPointerDown = (e: React.PointerEvent) => {
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: rect.left,
      baseY: rect.top,
      w: rect.width,
      h: rect.height,
    };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onDragPointerMove = (e: React.PointerEvent) => {
    const d = dragState.current;
    if (!d) return;
    // Dragging always undocks — a dragged panel floats where you put it.
    if (dock) setDock(null);
    const nx = d.baseX + (e.clientX - d.startX);
    const ny = d.baseY + (e.clientY - d.startY);
    setPos({
      x: Math.max(8, Math.min(nx, window.innerWidth - d.w - 8)),
      y: Math.max(8, Math.min(ny, window.innerHeight - 40)),
    });
  };
  const onDragPointerUp = (e: React.PointerEvent) => {
    dragState.current = null;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  };

  const toggleDock = (side: Exclude<FloatingPanelDock, null>) => {
    setPos(null);
    setDock((current) => (current === side ? null : side));
  };

  // Minimized panels live in the shared dock, which owns restoring them.
  if (!open || minimized) return null;

  const style: React.CSSProperties = dock
    ? dock === "left" || dock === "right"
      ? { position: "fixed", top: 16, bottom: 16, [dock]: 16 }
      : // top / bottom: span the width along that edge
        { position: "fixed", left: 16, right: 16, [dock]: 16 }
    : pos
      ? { position: "fixed", left: pos.x, top: pos.y }
      : {
          position: "fixed",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
        };

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[100]">
      <div
        ref={panelRef}
        style={style}
        className={`pointer-events-auto flex max-h-[85vh] flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl ${
          dock === "top" || dock === "bottom" ? "" : widthClassName
        }`}
      >
        <div
          onPointerDown={onDragPointerDown}
          onPointerMove={onDragPointerMove}
          onPointerUp={onDragPointerUp}
          className="flex cursor-grab touch-none items-center gap-2 border-b border-zinc-800 bg-zinc-900/60 px-4 py-3 active:cursor-grabbing"
        >
          <GripHorizontal className="h-4 w-4 shrink-0 text-zinc-600" />
          {icon}
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {title}
          </span>
          {dockable ? (
            <>
              <button
                type="button"
                onClick={() => toggleDock("left")}
                aria-label="Dock left"
                aria-pressed={dock === "left"}
                title="Dock left"
                className={`rounded p-1 hover:bg-zinc-800 hover:text-white ${
                  dock === "left" ? "text-white" : "text-zinc-400"
                }`}
              >
                <PanelLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => toggleDock("right")}
                aria-label="Dock right"
                aria-pressed={dock === "right"}
                title="Dock right"
                className={`rounded p-1 hover:bg-zinc-800 hover:text-white ${
                  dock === "right" ? "text-white" : "text-zinc-400"
                }`}
              >
                <PanelRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => toggleDock("top")}
                aria-label="Dock top"
                aria-pressed={dock === "top"}
                title="Dock top"
                className={`rounded p-1 hover:bg-zinc-800 hover:text-white ${
                  dock === "top" ? "text-white" : "text-zinc-400"
                }`}
              >
                <PanelTop className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => toggleDock("bottom")}
                aria-label="Dock bottom"
                aria-pressed={dock === "bottom"}
                title="Dock bottom"
                className={`rounded p-1 hover:bg-zinc-800 hover:text-white ${
                  dock === "bottom" ? "text-white" : "text-zinc-400"
                }`}
              >
                <PanelBottom className="h-4 w-4" />
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={minimize}
            aria-label="Minimize"
            title="Minimize"
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
