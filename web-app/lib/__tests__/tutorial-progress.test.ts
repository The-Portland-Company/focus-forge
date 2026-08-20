import { test } from "node:test";
import assert from "node:assert/strict";

import {
  applyBookmark,
  applyChapterComplete,
  applyDismissTooltip,
  applyRecordViewed,
  applySectionFlag,
  isChapterFullyComplete,
} from "../tutorial/progress";
import { getChapterProgress, type TutorialProgress } from "../tutorial/types";

const NOW = "2026-08-20T00:00:00.000Z";
const LATER = "2026-08-21T00:00:00.000Z";

test("applySectionFlag sets the flag and stamps viewedAt once", () => {
  let p: TutorialProgress = {};
  p = applySectionFlag(p, "getting-started", "welcome", "reviewed", true, NOW);
  const chap = getChapterProgress(p, "getting-started");
  assert.equal(chap.sections?.welcome?.reviewed, true);
  assert.equal(chap.sections?.welcome?.viewedAt, NOW);

  // A later completed flag must not overwrite the original viewedAt.
  p = applySectionFlag(p, "getting-started", "welcome", "completed", true, LATER);
  const chap2 = getChapterProgress(p, "getting-started");
  assert.equal(chap2.sections?.welcome?.reviewed, true);
  assert.equal(chap2.sections?.welcome?.completed, true);
  assert.equal(chap2.sections?.welcome?.viewedAt, NOW);
});

test("applySectionFlag can unset a flag", () => {
  let p: TutorialProgress = {};
  p = applySectionFlag(p, "c", "s", "completed", true, NOW);
  p = applySectionFlag(p, "c", "s", "completed", false, NOW);
  assert.equal(getChapterProgress(p, "c").sections?.s?.completed, false);
});

test("applyChapterComplete flips the chapter flag without touching sections", () => {
  let p: TutorialProgress = applySectionFlag({}, "c", "s", "reviewed", true, NOW);
  p = applyChapterComplete(p, "c", true);
  const chap = getChapterProgress(p, "c");
  assert.equal(chap.completed, true);
  assert.equal(chap.sections?.s?.reviewed, true);
});

test("applyBookmark sets and clears a single bookmark per chapter", () => {
  let p: TutorialProgress = applyBookmark({}, "c", "s2");
  assert.equal(getChapterProgress(p, "c").bookmarkedSectionSlug, "s2");
  p = applyBookmark(p, "c", null);
  assert.equal(getChapterProgress(p, "c").bookmarkedSectionSlug, null);
});

test("applyRecordViewed records lastVisited and viewedAt idempotently", () => {
  let p: TutorialProgress = applyRecordViewed({}, "c", "s", NOW);
  assert.deepEqual(p.lastVisited, { chapter: "c", section: "s" });
  assert.equal(getChapterProgress(p, "c").sections?.s?.viewedAt, NOW);

  // Second view keeps the original stamp but updates lastVisited.
  p = applyRecordViewed(p, "c", "s", LATER);
  assert.equal(getChapterProgress(p, "c").sections?.s?.viewedAt, NOW);
});

test("applyDismissTooltip appends once and dedupes", () => {
  let p: TutorialProgress = applyDismissTooltip({}, "create-menu");
  p = applyDismissTooltip(p, "create-menu");
  p = applyDismissTooltip(p, "ai-assistant");
  assert.deepEqual(p.dismissedTooltips, ["create-menu", "ai-assistant"]);
});

test("isChapterFullyComplete only when every section is complete", () => {
  let p: TutorialProgress = {};
  p = applySectionFlag(p, "c", "a", "completed", true, NOW);
  assert.equal(isChapterFullyComplete(p, "c", ["a", "b"]), false);
  p = applySectionFlag(p, "c", "b", "completed", true, NOW);
  assert.equal(isChapterFullyComplete(p, "c", ["a", "b"]), true);
});
