"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { publishDockBadgeCount } from "@/lib/dock-badge";

const POLL_INTERVAL_MS = 30 * 1000;

async function fetchAndPublishBadge() {
  try {
    const response = await fetch("/api/email/unread-count", {
      credentials: "include",
    });
    if (response.status === 401) {
      // Signed out — nothing to count.
      publishDockBadgeCount(0);
      return;
    }
    if (!response.ok) return;
    const payload = (await response.json()) as { count?: number };
    publishDockBadgeCount(Number(payload?.count || 0));
  } catch {
    // Dock badge is best-effort; ignore transient failures.
  }
}

/**
 * App-wide macOS Dock badge synchronizer.
 *
 * Mounted once in the root layout so the unread-email count (excluding spam)
 * stays on the Dock icon regardless of which view — or no view — is open. It
 * polls a lightweight count endpoint on an interval, on tab focus, and whenever
 * app data changes; when the email inbox view is mounted it also publishes live
 * from in-memory state, and the last writer wins. The polling is intentionally
 * not gated on client auth state (which can lag) — the endpoint returns 401
 * when signed out, which clears the badge.
 */
export function DockBadgeSync() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const pathname = usePathname();

  // Steady-state polling: interval + tab focus + app data changes.
  useEffect(() => {
    void fetchAndPublishBadge();

    const interval = window.setInterval(fetchAndPublishBadge, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchAndPublishBadge();
    };
    window.addEventListener("focusforge:data-changed", fetchAndPublishBadge);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener(
        "focusforge:data-changed",
        fetchAndPublishBadge,
      );
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Refresh immediately when auth state resolves or the route changes (e.g.
  // login -> /today) so the badge appears promptly rather than waiting for the
  // next interval tick.
  useEffect(() => {
    void fetchAndPublishBadge();
  }, [userId, pathname]);

  // The Safari/macOS Badging API silently no-ops unless Notification permission
  // has been granted IN THE INSTALLED WEB APP (per WebKit). Auto-prompt once on
  // first user interaction when running standalone; remember we asked so we
  // don't pester. Outside an installed app, do nothing (Safari tabs can't badge
  // anyway, and we don't want to prompt regular browser users).
  useEffect(() => {
    if (typeof window === "undefined" || typeof Notification === "undefined") return;
    if (Notification.permission !== "default") return;
    const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches;
    if (!standalone) return;
    const PROMPT_KEY = "dockBadgeNotifPrompted";
    if (localStorage.getItem(PROMPT_KEY) === "true") return;
    const ask = () => {
      localStorage.setItem(PROMPT_KEY, "true");
      Notification.requestPermission()
        .catch(() => undefined)
        .finally(() => void fetchAndPublishBadge());
      window.removeEventListener("pointerdown", ask);
      window.removeEventListener("keydown", ask);
    };
    window.addEventListener("pointerdown", ask, { once: true });
    window.addEventListener("keydown", ask, { once: true });
    return () => {
      window.removeEventListener("pointerdown", ask);
      window.removeEventListener("keydown", ask);
    };
  }, []);

  return null;
}
