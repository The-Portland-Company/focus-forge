"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAlertCenter } from "@/contexts/ToastContext";

/**
 * One-time feature announcement for the Jev triage integration, raised as a
 * sticky card in the alert bell panel (not a floating toast — it is news the
 * user reads when they choose, not feedback on an action). Shown once per
 * browser; the localStorage key is versioned so a future announcement can
 * reuse this pattern without colliding.
 */
const SEEN_KEY = "jevIntro:v1:seen";
const ALERT_ID = "jev-triage-intro";

export function JevIntroNudge() {
  const { upsertAlert } = useAlertCenter();
  const pathname = usePathname() || "";

  useEffect(() => {
    if (pathname.startsWith("/auth") || pathname.startsWith("/login")) return;
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(SEEN_KEY) === "1") return;
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Private mode / storage blocked: show it this load rather than loop.
    }

    upsertAlert({
      id: ALERT_ID,
      type: "info",
      title: "New: AI task triage with Jev",
      message:
        "Jev now scores your open tasks and can set calibrated priorities for you — automatically each night, and on demand.",
      hint:
        "Only high-confidence calls change a priority; each change leaves a comment explaining why. Lower-confidence suggestions are listed for you to review, never auto-applied.",
      createdAt: Date.now(),
      duration: 0,
    });
  }, [pathname, upsertAlert]);

  return null;
}
