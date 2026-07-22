"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Task } from "@/lib/types";
import { canBeSelectedAsDependency } from "@/lib/dependency-utils";
import { useToast } from "@/contexts/ToastContext";

/**
 * Drag-to-link dependency affordance.
 *
 * The user grabs the link handle on a task row and drags a curved line onto
 * another row. On drop the SOURCE task becomes dependent on (blocked by) the
 * TARGET task — i.e. `source.dependsOn` gains the target's id, matching how
 * getBlockedTaskIds / the completion guard interpret dependsOn (a task is
 * blocked while any id in its dependsOn is not yet complete).
 */
export interface DependencyLinkDragState {
  sourceId: string;
  // Anchor point (row-right, vertically centred) in viewport coords.
  originX: number;
  originY: number;
  cursorX: number;
  cursorY: number;
  targetId: string | null;
}

interface UseDependencyLinkDragArgs {
  allTasks?: Task[];
  // Persists the new edge. Should resolve true on success, false on failure.
  onLink?: (sourceId: string, targetId: string) => Promise<boolean>;
}

export function useDependencyLinkDrag({
  allTasks,
  onLink,
}: UseDependencyLinkDragArgs) {
  const [drag, setDrag] = useState<DependencyLinkDragState | null>(null);
  // Task ids to briefly flash green after a successful link.
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const { showSuccess, showError } = useToast();
  const dragRef = useRef<DependencyLinkDragState | null>(null);
  dragRef.current = drag;

  const allTasksRef = useRef<Task[] | undefined>(allTasks);
  allTasksRef.current = allTasks;
  const onLinkRef = useRef(onLink);
  onLinkRef.current = onLink;

  const flash = useCallback((ids: string[]) => {
    setFlashIds(new Set(ids));
    window.setTimeout(() => setFlashIds(new Set()), 900);
  }, []);

  // Begin a drag from a task row's link handle.
  const startLinkDrag = useCallback(
    (sourceId: string, event: React.PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const row = (event.currentTarget as HTMLElement).closest(
        "[data-task-row]",
      ) as HTMLElement | null;
      const rect = row?.getBoundingClientRect();
      const originX = rect ? rect.right - 8 : event.clientX;
      const originY = rect ? rect.top + rect.height / 2 : event.clientY;
      setDrag({
        sourceId,
        originX,
        originY,
        cursorX: event.clientX,
        cursorY: event.clientY,
        targetId: null,
      });
    },
    [],
  );

  useEffect(() => {
    if (!drag) return;

    const resolveTargetId = (x: number, y: number): string | null => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      const row = el?.closest("[data-task-row]") as HTMLElement | null;
      const id = row?.getAttribute("data-task-id") || null;
      if (!id || id === dragRef.current?.sourceId) return null;
      return id;
    };

    const handleMove = (e: PointerEvent) => {
      const targetId = resolveTargetId(e.clientX, e.clientY);
      setDrag((prev) =>
        prev
          ? { ...prev, cursorX: e.clientX, cursorY: e.clientY, targetId }
          : prev,
      );
    };

    const handleUp = async (e: PointerEvent) => {
      const current = dragRef.current;
      const targetId = resolveTargetId(e.clientX, e.clientY);
      setDrag(null);
      if (!current || !targetId) return;

      const tasks = allTasksRef.current || [];
      const { canSelect, reason } = canBeSelectedAsDependency(
        current.sourceId,
        targetId,
        tasks,
      );
      if (!canSelect) {
        showError("Can't link tasks", reason || "Invalid dependency");
        return;
      }

      const source = tasks.find((t) => t.id === current.sourceId);
      const target = tasks.find((t) => t.id === targetId);
      const linker = onLinkRef.current;
      if (!linker) return;

      const ok = await linker(current.sourceId, targetId);
      if (ok) {
        flash([current.sourceId, targetId]);
        showSuccess(
          "Dependency added",
          source && target
            ? `"${source.name}" is now blocked by "${target.name}"`
            : undefined,
        );
      } else {
        showError("Couldn't add dependency", "Please try again.");
      }
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [drag, flash, showError, showSuccess]);

  return {
    drag,
    flashIds,
    startLinkDrag,
    isLinking: drag !== null,
  };
}

/**
 * Full-viewport SVG overlay that draws the in-progress curved link from the
 * source anchor to the cursor. Renders nothing when no drag is active.
 */
export function DependencyLinkOverlay({
  drag,
}: {
  drag: DependencyLinkDragState | null;
}) {
  if (!drag) return null;
  const { originX, originY, cursorX, cursorY } = drag;
  // Horizontal-tangent cubic bezier so the line leaves the row sideways and
  // sweeps toward the cursor — reads as a connector, not a straight tether.
  const dx = Math.max(40, Math.abs(cursorX - originX) * 0.5);
  const c1x = originX + dx;
  const c2x = cursorX - dx;
  const path = `M ${originX} ${originY} C ${c1x} ${originY}, ${c2x} ${cursorY}, ${cursorX} ${cursorY}`;
  const themed = "rgb(var(--theme-primary-rgb))";

  return (
    <svg
      className="pointer-events-none fixed inset-0 z-[100] h-full w-full"
      aria-hidden="true"
    >
      <path
        d={path}
        fill="none"
        stroke={themed}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeDasharray="6 5"
        opacity={0.9}
      />
      <circle cx={originX} cy={originY} r={4} fill={themed} />
      <circle
        cx={cursorX}
        cy={cursorY}
        r={drag.targetId ? 6 : 4}
        fill={drag.targetId ? themed : "transparent"}
        stroke={themed}
        strokeWidth={2}
      />
    </svg>
  );
}
