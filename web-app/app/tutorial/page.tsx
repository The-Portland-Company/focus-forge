"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  BookOpen,
  CheckCircle2,
  Play,
  Sparkles,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import { useTutorialChapters, useTutorialProgress } from "@/lib/tutorial/hooks";
import type { TutorialChapter } from "@/lib/tutorial/types";

function ProgressRing({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const r = 16;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-11 w-11 shrink-0">
      <svg viewBox="0 0 40 40" className="h-11 w-11 -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" stroke="currentColor" strokeWidth="4" className="text-white/10" />
        <circle
          cx="20" cy="20" r={r} fill="none" stroke="currentColor" strokeWidth="4"
          strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100} strokeLinecap="round"
          className="text-indigo-400 transition-all"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-white">
        {pct}%
      </span>
    </div>
  );
}

export default function TutorialIndexPage() {
  const { chapters, loading } = useTutorialChapters();
  const { progress, chapterProgress } = useTutorialProgress();

  const grouped = useMemo(() => {
    const core = chapters.filter((c) => c.topic === "core");
    const nuance = chapters.filter((c) => c.topic === "nuance");
    return { core, nuance };
  }, [chapters]);

  const resume = progress.lastVisited;

  function chapterStats(c: TutorialChapter) {
    const cp = chapterProgress(c.slug);
    const done = c.sections.filter((s) => cp.sections?.[s.slug]?.completed).length;
    return { done, total: c.sections.length };
  }

  function ChapterCard({ c }: { c: TutorialChapter }) {
    const { done, total } = chapterStats(c);
    const cp = chapterProgress(c.slug);
    const first = c.sections[0];
    const target = cp.bookmarkedSectionSlug ?? first?.slug;
    return (
      <Link
        href={target ? `/tutorial/${c.slug}/${target}` : "#"}
        className="group flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 transition hover:border-indigo-400/40 hover:bg-white/[0.04]"
      >
        <ProgressRing done={done} total={total} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold text-white">{c.title}</h3>
            {cp.completed && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />}
          </div>
          {c.summary && <p className="truncate text-sm text-gray-400">{c.summary}</p>}
          <p className="mt-1 text-xs text-gray-500">
            {done}/{total} sections
          </p>
        </div>
        <ArrowRight className="h-5 w-5 shrink-0 text-gray-500 transition group-hover:translate-x-0.5 group-hover:text-indigo-300" />
      </Link>
    );
  }

  return (
    <main className="min-h-screen bg-[#0E0F16] text-gray-200">
      <div className="mx-auto max-w-3xl px-6 py-14">
        <header className="mb-10 border-b border-white/10 pb-8">
          <Link
            href="/"
            className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-400 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> Back to app
          </Link>
          <p className="text-sm font-medium uppercase tracking-widest text-indigo-400">
            Focus: Forge
          </p>
          <h1 className="mt-2 flex items-center gap-3 text-4xl font-bold text-white">
            <BookOpen className="h-8 w-8 text-indigo-400" /> Tutorial
          </h1>
          <p className="mt-3 max-w-xl text-gray-400">
            Learn Focus: Forge at your own pace. Start a chapter, stop anytime,
            and pick up right where you left off.
          </p>
          {resume?.chapter && resume?.section && (
            <Link
              href={`/tutorial/${resume.chapter}/${resume.section}`}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400"
            >
              <Play className="h-4 w-4" /> Continue where you left off
            </Link>
          )}
        </header>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-white/[0.03]" />
            ))}
          </div>
        ) : chapters.length === 0 ? (
          <p className="text-gray-500">No tutorial chapters are published yet.</p>
        ) : (
          <div className="space-y-10">
            {grouped.core.length > 0 && (
              <section>
                <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
                  <Sparkles className="h-5 w-5 text-indigo-400" /> Core Topics
                </h2>
                <div className="space-y-3">
                  {grouped.core.map((c) => (
                    <ChapterCard key={c.id} c={c} />
                  ))}
                </div>
              </section>
            )}
            {grouped.nuance.length > 0 && (
              <section>
                <h2 className="mb-4 text-lg font-semibold text-white">
                  Nuances &amp; Power Features
                </h2>
                <div className="space-y-3">
                  {grouped.nuance.map((c) => (
                    <ChapterCard key={c.id} c={c} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
