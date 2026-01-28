"use client"

import { Search, Calendar, CalendarDays, Star, ArrowUpDown, User, Link2Off, Square } from 'lucide-react'
import Link from 'next/link'

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
  )
}

export function SkeletonProject() {
  return (
    <div className="flex items-center gap-2 px-2 py-0.5 animate-pulse">
      <div className="w-5 h-3 bg-zinc-800 rounded text-[8px]" />
      <div className="h-3 bg-zinc-800 rounded w-24" />
    </div>
  )
}

export function SkeletonTask() {
  return (
    <div className="flex items-start gap-3 px-4 py-1 animate-pulse">
      {/* Checkbox */}
      <div className="w-5 h-5 bg-zinc-800 rounded-full mt-0.5" />
      {/* Content */}
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-zinc-800 rounded w-3/4" />
      </div>
      {/* Right side icons */}
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 bg-zinc-800 rounded" />
        <div className="w-12 h-3 bg-zinc-800 rounded" />
        <div className="w-4 h-4 bg-zinc-800 rounded" />
      </div>
    </div>
  )
}

export function SkeletonTaskList({ count = 5 }: { count?: number }) {
  return (
    <div className="py-4 space-y-1">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonTask key={i} />
      ))}
    </div>
  )
}

export function SkeletonSidebar() {
  return (
    <div className="w-64 bg-zinc-950 border-r border-zinc-800 flex flex-col h-full">
      {/* Header - static, no skeleton needed */}
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-zinc-800 rounded-full animate-pulse" />
          <span className="text-lg font-semibold text-white">Command Center</span>
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
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Organizations</span>
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
  )
}

export function SkeletonTodayView() {
  return (
    <div className="max-w-4xl mx-auto p-8">
      {/* Header - static content is real, only task count needs loading */}
      <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-white">Today</h1>
            <div className="px-4 py-1 rounded-lg bg-zinc-800 border border-zinc-700">
              <span className="text-sm font-medium text-zinc-300">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 bg-zinc-800 rounded w-16 animate-pulse" />
          </div>
        </div>
      </div>

      {/* Filter bar - controls are static */}
      <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 mb-4">
        <div className="flex items-center gap-4">
          <div className="relative flex items-center">
            <Search className="absolute left-3 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search tasks..."
              disabled
              className="bg-zinc-800 text-white text-sm pl-9 pr-3 py-1.5 rounded border border-zinc-700 w-48 opacity-50"
            />
          </div>

          <div className="flex items-center gap-1">
            <ArrowUpDown className="w-4 h-4 text-zinc-400" />
            <select disabled className="bg-zinc-800 text-white text-sm px-3 py-1 rounded border border-zinc-700 opacity-50">
              <option>Due Date</option>
            </select>
          </div>

          <div className="flex items-center gap-1">
            <User className="w-4 h-4 text-zinc-400" />
            <select disabled className="bg-zinc-800 text-white text-sm px-3 py-1 rounded border border-zinc-700 opacity-50">
              <option>Me + Unassigned</option>
            </select>
          </div>

          <button disabled className="p-2 rounded border bg-zinc-800 text-zinc-400 border-zinc-700 opacity-50">
            <Link2Off className="w-4 h-4" />
          </button>

          <button disabled className="p-2 rounded border bg-zinc-800 text-zinc-400 border-zinc-700 opacity-50">
            <Square className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Task list - dynamic, needs skeleton */}
      <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-1">
        <SkeletonTaskList count={6} />
      </div>
    </div>
  )
}
