"use client";

// Small floating help entry point: start the tutorial, resume where you left
// off, or silence the contextual coach-marks. Mounted globally in the layout.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BookOpen, GraduationCap, Play, Lightbulb, X } from "lucide-react";
import clsx from "clsx";
import { useTutorialProgress } from "@/lib/tutorial/hooks";

export function TutorialLauncher() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { progress, tipsEnabled, setTipsEnabled } = useTutorialProgress();

  // Hide on the tutorial reader itself and on auth/share surfaces.
  const hidden =
    pathname.startsWith("/tutorial") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/share");

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (hidden) return null;

  const resume = progress.lastVisited;

  return (
    <div ref={ref} className="fixed bottom-4 left-4 z-[9998]">
      {open && (
        <div className="mb-3 w-64 overflow-hidden rounded-xl border border-white/10 bg-[#171826] text-gray-200 shadow-2xl shadow-black/50">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-semibold text-white">
              <GraduationCap className="h-4 w-4 text-indigo-400" /> Learn Focus: Forge
            </span>
            <button onClick={() => setOpen(false)} aria-label="Close" className="text-gray-500 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="p-2">
            <Link
              href="/tutorial"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-white/[0.05] hover:text-white"
            >
              <BookOpen className="h-4 w-4 text-indigo-400" /> Browse tutorial
            </Link>
            {resume?.chapter && resume?.section && (
              <Link
                href={`/tutorial/${resume.chapter}/${resume.section}`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-white/[0.05] hover:text-white"
              >
                <Play className="h-4 w-4 text-emerald-400" /> Resume where you left off
              </Link>
            )}
            <button
              onClick={() => setTipsEnabled(!tipsEnabled)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-gray-300 hover:bg-white/[0.05] hover:text-white"
            >
              <Lightbulb className={clsx("h-4 w-4", tipsEnabled ? "text-amber-400" : "text-gray-500")} />
              {tipsEnabled ? "Hide contextual tips" : "Show contextual tips"}
            </button>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Help and tutorial"
        title="Learn Focus: Forge"
        className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-indigo-500 text-white shadow-lg transition hover:bg-indigo-400"
      >
        <GraduationCap className="h-5 w-5" />
      </button>
    </div>
  );
}
