"use client";

// Floating contextual coach-marks anchored over live UI features.
//
// Each published tutorial_tooltip carries an `anchor_key`; any element in the
// app that renders `data-tutorial-id="<anchor_key>"` becomes its anchor. This
// layer (mounted once, globally) finds the first not-yet-dismissed tooltip
// whose anchor is currently on screen and floats a small popover beside it.
// One at a time keeps the UI uncluttered; dismissals persist per user.

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X } from "lucide-react";
import { useTutorialTooltips, useTutorialProgress } from "@/lib/tutorial/hooks";
import { useTutorialSectionSlug } from "@/lib/tutorial/anchor-map";
import type { TutorialTooltip } from "@/lib/tutorial/types";

const GAP = 10;

function anchorRect(key: string): DOMRect | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector(`[data-tutorial-id="${CSS.escape(key)}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return r;
}

function computePosition(rect: DOMRect, placement: TutorialTooltip["placement"]) {
  const W = 288; // popover width (w-72)
  switch (placement) {
    case "top":
      return { top: rect.top - GAP, left: rect.left + rect.width / 2 - W / 2, transform: "translateY(-100%)" };
    case "left":
      return { top: rect.top, left: rect.left - GAP - W, transform: "none" };
    case "right":
      return { top: rect.top, left: rect.right + GAP, transform: "none" };
    case "bottom":
    default:
      return { top: rect.bottom + GAP, left: rect.left + rect.width / 2 - W / 2, transform: "none" };
  }
}

export function TutorialCoachmarkLayer() {
  const { tooltips } = useTutorialTooltips();
  const { tipsEnabled, dismissedTooltips, dismissTooltip, loading } =
    useTutorialProgress();
  const sectionSlugFor = useTutorialSectionSlug();
  const [tick, setTick] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Re-measure on resize/scroll so the popover tracks its anchor.
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener("resize", bump);
    window.addEventListener("scroll", bump, true);
    const id = window.setInterval(bump, 1000); // catch late-mounting anchors
    return () => {
      window.removeEventListener("resize", bump);
      window.removeEventListener("scroll", bump, true);
      window.clearInterval(id);
    };
  }, []);

  const active = useMemo(() => {
    void tick;
    if (!tipsEnabled || loading) return null;
    for (const t of tooltips) {
      if (dismissedTooltips.includes(t.anchor_key)) continue;
      const rect = anchorRect(t.anchor_key);
      if (rect) return { tooltip: t, rect };
    }
    return null;
  }, [tooltips, dismissedTooltips, tipsEnabled, loading, tick]);

  if (!mounted || !active) return null;

  const { tooltip, rect } = active;
  const pos = computePosition(rect, tooltip.placement);
  const link = sectionSlugFor(tooltip.section_id);

  return createPortal(
    <div
      role="dialog"
      aria-label={tooltip.title}
      className="fixed z-[9999] w-72 rounded-xl border border-indigo-400/30 bg-[#171826] p-4 text-gray-200 shadow-2xl shadow-black/50"
      style={{ top: pos.top, left: Math.max(8, pos.left), transform: pos.transform }}
    >
      <button
        onClick={() => dismissTooltip(tooltip.anchor_key)}
        aria-label="Dismiss"
        className="absolute right-2 top-2 rounded p-1 text-gray-500 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
      <h4 className="pr-5 text-sm font-semibold text-white">{tooltip.title}</h4>
      <p className="mt-1.5 text-sm leading-relaxed text-gray-300">{tooltip.body}</p>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={() => dismissTooltip(tooltip.anchor_key)}
          className="rounded-md bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-400"
        >
          Got it
        </button>
        {link && (
          <Link
            href={link}
            onClick={() => dismissTooltip(tooltip.anchor_key)}
            className="text-xs font-medium text-indigo-300 hover:underline"
          >
            Learn more
          </Link>
        )}
      </div>
    </div>,
    document.body,
  );
}
