"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/lib/supabase/hooks";
import {
  clearDockBadge,
  DOCK_BADGE_PROMPT_STORAGE_KEY,
  hasDockBadgeLiveSource,
  publishDockBadgeCount,
  shouldPromptForBadgePermission,
  shouldSyncDockBadge,
} from "@/lib/dock-badge";

const POLL_INTERVAL_MS = 30 * 1000;

async function fetchAndPublishBadge() {
  // Stand down while the email inbox view is mounted — it publishes the same
  // count live from in-memory state, and two writers racing on document.title
  // is what made the tab title flicker between counts during triage.
  if (hasDockBadgeLiveSource()) return;
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
  const { profile } = useUserProfile();

  // Per-account "Dock badge" preference. Defaults ON: anything other than an
  // explicit `false` (including while the profile is still loading) keeps the
  // badge syncing, so existing users are unaffected until they opt out.
  const badgeEnabled = shouldSyncDockBadge(profile?.dock_badge_enabled);

  // Steady-state polling: interval + tab focus + app data changes. Short-circuit
  // entirely when the user disabled the Dock badge — clear it once and never
  // start the poller. Re-running on `badgeEnabled` means flipping the setting
  // off clears immediately and flipping it back on resumes polling.
  useEffect(() => {
    if (!badgeEnabled) {
      clearDockBadge();
      return;
    }

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
  }, [badgeEnabled]);

  // Refresh immediately when auth state resolves or the route changes (e.g.
  // login -> /today) so the badge appears promptly rather than waiting for the
  // next interval tick. Skip while the badge is disabled.
  useEffect(() => {
    if (!badgeEnabled) return;
    void fetchAndPublishBadge();
  }, [userId, pathname, badgeEnabled]);

  // The Safari/macOS Badging API silently no-ops unless Notification permission
  // has been granted IN THE INSTALLED WEB APP (per WebKit). Auto-prompt once on
  // first user interaction when running standalone; remember we asked so we
  // don't pester. Outside an installed app, do nothing (Safari tabs can't badge
  // anyway, and we don't want to prompt regular browser users).
  useEffect(() => {
    if (typeof window === "undefined" || typeof Notification === "undefined") {
      return;
    }

    const standalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;

    let alreadyPrompted = false;
    try {
      alreadyPrompted =
        window.localStorage?.getItem(DOCK_BADGE_PROMPT_STORAGE_KEY) === "true";
    } catch {
      // Private mode / disabled storage — treat as not prompted.
    }

    if (
      !shouldPromptForBadgePermission({
        standalone,
        permission: Notification.permission,
        alreadyPrompted,
      })
    ) {
      return;
    }

    // Safari requires requestPermission() to run inside a user-gesture handler.
    // Fire once on the first interaction, then detach all listeners so we never
    // prompt again this mount; the localStorage flag prevents re-prompting on
    // future loads regardless of whether the user granted or denied.
    const cleanup = () => {
      window.removeEventListener("pointerdown", ask);
      window.removeEventListener("keydown", ask);
    };

    const ask = () => {
      cleanup();
      try {
        window.localStorage?.setItem(DOCK_BADGE_PROMPT_STORAGE_KEY, "true");
      } catch {
        // Ignore storage failures; the in-mount cleanup still prevents repeats.
      }
      // requestPermission may return a promise (modern) or use a legacy
      // callback. Normalize to a promise and refresh the badge afterward.
      try {
        const result = Notification.requestPermission(() =>
          void fetchAndPublishBadge(),
        );
        if (result && typeof result.then === "function") {
          result.catch(() => undefined).finally(() => void fetchAndPublishBadge());
        }
      } catch {
        // Some engines throw when called without a callback; ignore.
      }
    };

    window.addEventListener("pointerdown", ask);
    window.addEventListener("keydown", ask);
    return cleanup;
  }, []);

  return null;
}
