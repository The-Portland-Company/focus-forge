"use client";

import {
  Search,
  Calendar,
  CalendarDays,
  Star,
  ArrowUpDown,
  User,
  Link2Off,
  Square,
  ChevronDown,
} from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";

// Skeleton components for loading states - only for dynamic data

export function SkeletonOrganization() {
  return (
    <div className="animate-pulse">
      {/* Organization header */}
      <div className="flex items-center gap-2 px-2 py-1 mb-1">
        <div className="w-4 h-4 bg-zinc-800 rounded" />
        <div className="h-4 bg-zinc-800 rounded w-32" />
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
    <div className="flex items-center gap-2 px-2 py-0.5 animate-pulse">
      <div className="w-5 h-3 bg-zinc-800 rounded text-[8px]" />
      <div className="h-3 bg-zinc-800 rounded w-24" />
    </div>
  );
}

export function SkeletonTask({
  showDueBadge = true,
}: {
  showDueBadge?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-1 animate-pulse">
      {/* Checkbox circle */}
      <div className="w-5 h-5 bg-zinc-800 rounded-full mt-0.5 flex-shrink-0" />
      {/* Due date badge + task name */}
      <div className="flex items-start gap-2 flex-1 min-w-0">
        {showDueBadge && (
          <div className="w-[160px] h-5 bg-zinc-800 rounded-full flex-shrink-0" />
        )}
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <div className="h-4 bg-zinc-800 rounded w-3/4" />
          {/* Some tasks have descriptions */}
          <div className="h-3 bg-zinc-800/50 rounded w-1/2" />
        </div>
      </div>
      {/* Right side: priority flag placeholder */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="w-4 h-4 bg-zinc-800 rounded" />
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

export function SkeletonSidebar() {
  return (
    <div className="w-64 bg-zinc-950 border-r border-zinc-800 flex flex-col h-full">
      {/* Header - static, no skeleton needed */}
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-zinc-800 rounded-full animate-pulse" />
          <span className="text-lg font-semibold text-white">
            Command Center
          </span>
        </div>
      </div>

      {/* Navigation - these are static/instant */}
      <nav className="px-2 py-2">
        <Link
          href="/search"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:bg-zinc-800/50 hover:text-white transition-colors"
        >
          <Search className="w-4 h-4" />
          Search
        </Link>
        <Link
          href="/today"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:bg-zinc-800/50 hover:text-white transition-colors"
        >
          <Calendar className="w-4 h-4" />
          Today
        </Link>
        <Link
          href="/upcoming"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:bg-zinc-800/50 hover:text-white transition-colors"
        >
          <CalendarDays className="w-4 h-4" />
          Upcoming
        </Link>
        <Link
          href="/favorites"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:bg-zinc-800/50 hover:text-white transition-colors mb-4"
        >
          <Star className="w-4 h-4" />
          Favorites
        </Link>
      </nav>

      {/* Organizations - dynamic, needs skeleton */}
      <div className="flex-1 overflow-y-auto px-2">
        <div className="flex items-center justify-between px-2 py-1 mb-2">
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
            Organizations
          </span>
        </div>
        <div className="space-y-4">
          <SkeletonOrganization />
          <SkeletonOrganization />
        </div>
      </div>

      {/* Footer - user info needs loading */}
      <div className="p-4 border-t border-zinc-800 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-zinc-800 rounded-full" />
          <div className="space-y-1">
            <div className="h-4 bg-zinc-800 rounded w-20" />
            <div className="h-3 bg-zinc-800 rounded w-16" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SkeletonSectionHeader({ title }: { title: string }) {
  return (
    <div className="w-full flex items-center justify-between py-2 px-1 border-b border-zinc-700">
      <span className="text-sm font-medium text-zinc-500">
        {title}{" "}
        <span className="text-zinc-600 animate-pulse inline-block w-6 h-4 bg-zinc-800 rounded align-middle" />
      </span>
      <ChevronDown className="w-4 h-4 text-zinc-600" />
    </div>
  );
}

export function SkeletonTodayView() {
  const todayDate = new Date();
  const todayLabel = `${format(todayDate, "EEE")}. ${format(todayDate, "MMM")}. ${format(todayDate, "do")} '${format(todayDate, "yy")}`;

  return (
    <div className="relative">
      {/* Sticky header bar - matches real Today header */}
      <div className="sticky top-0 z-40 w-full bg-zinc-900 border-b border-zinc-800">
        <div className="w-full px-4 py-4">
          <div className="flex items-center justify-between gap-4 overflow-x-auto">
            {/* Date label - static */}
            <div className="flex items-center gap-4 shrink-0">
              <div className="px-4 py-1 bg-zinc-800 border border-zinc-700">
                <span className="text-sm font-medium text-zinc-300">
                  {todayLabel}
                </span>
              </div>
            </div>

            {/* Search - static, disabled */}
            <div className="relative flex items-center flex-1 min-w-[220px] max-w-[360px]">
              <Search className="absolute left-3 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Search tasks..."
                disabled
                className="bg-zinc-800 text-white text-sm pl-9 pr-3 py-1.5 rounded border border-zinc-700 focus:outline-none w-full opacity-50"
              />
            </div>

            {/* Right side controls - static icons, disabled */}
            <div className="flex items-center justify-end gap-4 shrink-0">
              <div className="flex items-center gap-1">
                <CalendarDays className="w-4 h-4 text-zinc-400 opacity-50" />
              </div>
              <div className="flex items-center gap-1">
                <button
                  disabled
                  className="p-2 rounded border border-zinc-700 text-zinc-400 opacity-50"
                >
                  <ArrowUpDown className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-1">
                <User className="w-4 h-4 text-zinc-400 opacity-50" />
                <div className="h-8 w-[170px] bg-zinc-800 rounded border border-zinc-700 opacity-50" />
              </div>
              <button
                disabled
                className="p-2 rounded border bg-zinc-800 text-zinc-400 border-zinc-700 opacity-50"
              >
                <Link2Off className="w-4 h-4" />
              </button>
              <button
                disabled
                className="p-2 rounded border bg-zinc-800 text-zinc-400 border-zinc-700 opacity-50"
              >
                <Square className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Task sections - dynamic, needs skeleton */}
      <div className="w-full pb-8 pt-6">
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 space-y-2 mx-4">
          {/* Today section */}
          <div>
            <SkeletonSectionHeader title="Today" />
            <SkeletonTaskList count={4} />
          </div>

          {/* Tomorrow section */}
          <div>
            <SkeletonSectionHeader title="Tomorrow" />
            <SkeletonTaskList count={3} />
          </div>

          {/* Rest of Week section */}
          <div>
            <SkeletonSectionHeader title="Rest of Week" />
            <SkeletonTaskList count={2} />
          </div>
        </div>
      </div>
    </div>
  );
}
