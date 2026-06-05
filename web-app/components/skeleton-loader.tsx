"use client";

import { Mail, FolderSearch, MessageSquare, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

// Data-region skeletons only.
//
// Static chrome (sidebar nav links, view headers, search bars, buttons, tabs)
// now renders instantly from the real components even while `database` is null —
// so this module no longer contains any whole-page or chrome skeletons. Every
// placeholder here covers a DB/API-fetched region and is dimensioned to match
// the real row it replaces (no layout shift). All visuals come from the single
// `Skeleton` primitive in components/ui/skeleton.tsx.

export function SkeletonOrganization() {
  return (
    <div>
      {/* Organization header */}
      <div className="flex items-center gap-2 px-2 py-1 mb-1">
        <Skeleton className="w-4 h-4" />
        <Skeleton className="h-4 w-32" />
      </div>
      {/* Projects */}
      <div className="ml-6 space-y-1">
        <SkeletonProject />
        <SkeletonProject />
        <SkeletonProject />
      </div>
    </div>
  );
}

export function SkeletonProject() {
  return (
    <div className="flex items-center gap-2 px-2 py-0.5">
      <Skeleton className="w-5 h-3 text-[8px]" />
      <Skeleton className="h-3 w-24" />
    </div>
  );
}

export function SkeletonTask({
  showDueBadge = true,
}: {
  showDueBadge?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-1">
      {/* Checkbox circle */}
      <Skeleton className="w-5 h-5 rounded-full mt-0.5 flex-shrink-0" />
      {/* Due date badge + task name */}
      <div className="flex items-start gap-2 flex-1 min-w-0">
        {showDueBadge && (
          <Skeleton className="w-[160px] h-5 rounded-full flex-shrink-0" />
        )}
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <Skeleton className="h-4 w-3/4" />
          {/* Some tasks have descriptions */}
          <Skeleton className="h-3 bg-zinc-800/50 w-1/2" />
        </div>
      </div>
      {/* Right side: priority flag placeholder */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <Skeleton className="w-4 h-4" />
      </div>
    </div>
  );
}

export function SkeletonTaskList({ count = 5 }: { count?: number }) {
  return (
    <div className="py-4 space-y-1">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonTask key={i} />
      ))}
    </div>
  );
}

/** Collapsible section header placeholder: real label text + a small count
 *  badge skeleton. Matches the real section header height so toggling between
 *  skeleton and real content produces no layout shift. */
function SkeletonSectionHeader({ title }: { title: string }) {
  return (
    <div className="w-full flex items-center justify-between py-2 px-1 border-b border-zinc-700">
      <span className="text-sm font-medium text-zinc-500">
        {title} <Skeleton className="inline-block w-6 h-4 align-middle" />
      </span>
    </div>
  );
}

/** A set of titled task-list sections, used in the Today view and project
 *  list/board views while the first load is in flight. */
export function SkeletonSectionedTasks({
  sections,
}: {
  sections: Array<{ title: string; count: number }>;
}) {
  return (
    <>
      {sections.map((section, i) => (
        <div key={`${section.title}-${i}`}>
          <SkeletonSectionHeader title={section.title} />
          <SkeletonTaskList count={section.count} />
        </div>
      ))}
    </>
  );
}

/** Single email list row placeholder, dimensioned to match EmailWorkList rows. */
export function SkeletonEmailRow() {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-3 w-52" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-5 w-12" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
          <div className="inline-flex items-center gap-1">
            <Mail className="h-3.5 w-3.5 text-zinc-700" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="inline-flex items-center gap-1">
            <FolderSearch className="h-3.5 w-3.5 text-zinc-700" />
            <Skeleton className="h-3 w-20" />
          </div>
          <div className="inline-flex items-center gap-1">
            <MessageSquare className="h-3.5 w-3.5 text-zinc-700" />
            <Skeleton className="h-3 w-16" />
          </div>
          <div className="inline-flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5 text-zinc-700" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      </div>
    </div>
  );
}
