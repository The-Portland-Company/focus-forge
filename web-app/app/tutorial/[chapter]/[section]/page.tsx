"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  Circle,
  Eye,
  EyeOff,
  List,
} from "lucide-react";
import clsx from "clsx";
import { useTutorialChapters, useTutorialProgress } from "@/lib/tutorial/hooks";
import { tutorialVideoUrl } from "@/lib/tutorial/queries";
import type { TutorialChapter, TutorialSection } from "@/lib/tutorial/types";

interface FlatSection {
  chapter: TutorialChapter;
  section: TutorialSection;
}

/** Minimal, safe markdown-ish renderer: paragraphs, headings, list items. */
function RichBody({ markdown }: { markdown?: string }) {
  if (!markdown) return null;
  const blocks = markdown.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="space-y-4 leading-relaxed text-gray-300">
      {blocks.map((block, i) => {
        if (block.startsWith("### "))
          return <h3 key={i} className="text-lg font-semibold text-white">{block.slice(4)}</h3>;
        if (block.startsWith("## "))
          return <h2 key={i} className="text-xl font-semibold text-white">{block.slice(3)}</h2>;
        if (/^[-*] /m.test(block)) {
          const items = block.split("\n").map((l) => l.replace(/^[-*]\s+/, ""));
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {items.map((it, j) => <li key={j}>{it}</li>)}
            </ul>
          );
        }
        return <p key={i}>{block}</p>;
      })}
    </div>
  );
}

export default function TutorialReaderPage() {
  const params = useParams<{ chapter: string; section: string }>();
  const router = useRouter();
  const { chapters, loading } = useTutorialChapters();
  const {
    chapterProgress,
    markReviewed,
    markSectionComplete,
    markChapterComplete,
    setBookmark,
    recordViewed,
  } = useTutorialProgress();

  const flat: FlatSection[] = useMemo(
    () =>
      chapters.flatMap((c) => c.sections.map((section) => ({ chapter: c, section }))),
    [chapters],
  );

  const idx = flat.findIndex(
    (f) => f.chapter.slug === params.chapter && f.section.slug === params.section,
  );
  const current = idx >= 0 ? flat[idx] : null;
  const prev = idx > 0 ? flat[idx - 1] : null;
  const next = idx >= 0 && idx < flat.length - 1 ? flat[idx + 1] : null;

  // Record view once per (chapter, section) landing.
  const recordedRef = useRef<string>("");
  useEffect(() => {
    if (!current) return;
    const key = `${current.chapter.slug}/${current.section.slug}`;
    if (recordedRef.current === key) return;
    recordedRef.current = key;
    recordViewed(current.chapter.slug, current.section.slug);
  }, [current, recordViewed]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#0E0F16] p-8">
        <div className="mx-auto max-w-5xl space-y-4">
          <div className="h-8 w-64 animate-pulse rounded bg-white/[0.05]" />
          <div className="h-64 animate-pulse rounded-xl bg-white/[0.03]" />
        </div>
      </main>
    );
  }

  if (!current) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0E0F16] text-gray-400">
        <div className="text-center">
          <p>That tutorial section could not be found.</p>
          <Link href="/tutorial" className="mt-3 inline-block text-indigo-400 hover:underline">
            Back to tutorial
          </Link>
        </div>
      </main>
    );
  }

  const { chapter, section } = current;
  const cp = chapterProgress(chapter.slug);
  const sp = cp.sections?.[section.slug] ?? {};
  const bookmarked = cp.bookmarkedSectionSlug === section.slug;
  const videoUrl = tutorialVideoUrl(section.video_path);

  async function completeAndAdvance() {
    await markSectionComplete(chapter.slug, section.slug, true);
    // If this was the last section of the chapter, mark the chapter complete.
    const allDone = chapter.sections.every((s) =>
      s.slug === section.slug ? true : cp.sections?.[s.slug]?.completed,
    );
    if (allDone) await markChapterComplete(chapter.slug, true);
    if (next) router.push(`/tutorial/${next.chapter.slug}/${next.section.slug}`);
  }

  return (
    <main className="min-h-screen bg-[#0E0F16] text-gray-200">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 py-10 lg:grid-cols-[260px_1fr]">
        {/* Sidebar TOC */}
        <aside className="hidden lg:block">
          <Link href="/" className="mb-3 inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Back to app
          </Link>
          <Link href="/tutorial" className="mb-4 flex items-center gap-1.5 text-sm text-gray-400 hover:text-white">
            <List className="h-4 w-4" /> All chapters
          </Link>
          <nav className="space-y-5">
            {chapters.map((c) => {
              const ccp = chapterProgress(c.slug);
              return (
                <div key={c.id}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {c.title}
                  </p>
                  <ul className="space-y-0.5">
                    {c.sections.map((s) => {
                      const active = c.slug === chapter.slug && s.slug === section.slug;
                      const done = ccp.sections?.[s.slug]?.completed;
                      const isBookmark = ccp.bookmarkedSectionSlug === s.slug;
                      return (
                        <li key={s.id}>
                          <Link
                            href={`/tutorial/${c.slug}/${s.slug}`}
                            className={clsx(
                              "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition",
                              active ? "bg-indigo-500/15 text-white" : "text-gray-400 hover:bg-white/[0.04] hover:text-gray-200",
                            )}
                          >
                            {done ? (
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                            ) : (
                              <Circle className="h-3.5 w-3.5 shrink-0 text-gray-600" />
                            )}
                            <span className="truncate">{s.title}</span>
                            {isBookmark && <BookmarkCheck className="ml-auto h-3.5 w-3.5 shrink-0 text-amber-400" />}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </nav>
        </aside>

        {/* Reader */}
        <article className="min-w-0">
          <div className="mb-4 flex items-center gap-4 lg:hidden">
            <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white">
              <ArrowLeft className="h-4 w-4" /> Back to app
            </Link>
            <Link href="/tutorial" className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white">
              <List className="h-4 w-4" /> All chapters
            </Link>
          </div>
          <p className="text-sm font-medium uppercase tracking-widest text-indigo-400">
            {chapter.title}
          </p>
          <div className="mt-2 flex items-start justify-between gap-4">
            <h1 className="text-3xl font-bold text-white">{section.title}</h1>
            <button
              onClick={() => setBookmark(chapter.slug, bookmarked ? null : section.slug)}
              title={bookmarked ? "Remove bookmark" : "Bookmark this section"}
              className="mt-1 shrink-0 rounded-lg border border-white/10 p-2 text-gray-400 transition hover:text-amber-400"
            >
              {bookmarked ? <BookmarkCheck className="h-5 w-5 text-amber-400" /> : <Bookmark className="h-5 w-5" />}
            </button>
          </div>

          {videoUrl && (
            <div className="my-6 overflow-hidden rounded-xl border border-white/10 bg-black">
              <video src={videoUrl} controls preload="metadata" className="aspect-video w-full" />
            </div>
          )}

          <div className="mt-6">
            <RichBody markdown={section.body?.markdown} />
          </div>

          {/* Review / complete controls */}
          <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-white/10 pt-6">
            <button
              onClick={() => markReviewed(chapter.slug, section.slug, !sp.reviewed)}
              className={clsx(
                "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition",
                sp.reviewed
                  ? "border-sky-400/40 bg-sky-500/10 text-sky-300"
                  : "border-white/10 text-gray-300 hover:border-white/20",
              )}
            >
              {sp.reviewed ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              {sp.reviewed ? "Reviewed" : "Mark as reviewed"}
            </button>
            <button
              onClick={() => markSectionComplete(chapter.slug, section.slug, !sp.completed)}
              className={clsx(
                "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition",
                sp.completed
                  ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
                  : "border-white/10 text-gray-300 hover:border-white/20",
              )}
            >
              {sp.completed ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
              {sp.completed ? "Completed" : "Mark complete"}
            </button>
          </div>

          {/* Forward / back */}
          <div className="mt-8 flex items-center justify-between gap-4">
            {prev ? (
              <Link
                href={`/tutorial/${prev.chapter.slug}/${prev.section.slug}`}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-gray-300 transition hover:border-white/20 hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="max-w-[10rem] truncate">{prev.section.title}</span>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <button
                onClick={completeAndAdvance}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-400"
              >
                <span className="max-w-[10rem] truncate">Next: {next.section.title}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={completeAndAdvance}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-400"
              >
                Finish chapter <CheckCircle2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </article>
      </div>
    </main>
  );
}
