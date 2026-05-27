import type { InboxItem } from "@/lib/types";

export const DOCK_BADGE_EVENT_NAME = "focus-forge:dock-badge-count-change";

const APP_TITLE = "Focus: Forge";

export function normalizeDockBadgeCount(count: number) {
  if (!Number.isFinite(count) || count <= 0) {
    return 0;
  }

  return Math.floor(count);
}

export function getDockBadgeDocumentTitle(count: number, appTitle = APP_TITLE) {
  const normalizedCount = normalizeDockBadgeCount(count);
  return normalizedCount > 0 ? `(${normalizedCount}) ${appTitle}` : appTitle;
}

/**
 * Global count of unread emails for the macOS Dock badge.
 *
 * "Unread, excluding spam" means: inbound messages still flagged unread that
 * are not spam/quarantine and not removed from the active inbox (deleted,
 * archived, resolved). This is intentionally independent of the currently
 * selected mailbox, view, or search query so the Dock badge reflects the
 * whole account, not whatever the user happens to be filtering on screen.
 */
export function computeUnreadBadgeCount(items: InboxItem[]): number {
  return items.reduce((count, item) => {
    if (!item.isUnread) {
      return count;
    }

    if (item.status === "spam" || item.classification === "spam") {
      return count;
    }

    if (
      item.status === "quarantine" ||
      item.status === "deleted" ||
      item.status === "archived" ||
      item.status === "resolved"
    ) {
      return count;
    }

    // Outbound-only threads can't be "unread" for the recipient.
    if (item.origin === "outbound") {
      return count;
    }

    return count + 1;
  }, 0);
}

export function publishDockBadgeCount(count: number) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedCount = normalizeDockBadgeCount(count);
  const badgingNavigator = navigator as Navigator & {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };

  if (normalizedCount > 0) {
    void badgingNavigator.setAppBadge?.(normalizedCount);
  } else {
    void badgingNavigator.clearAppBadge?.();
  }

  if (typeof document !== "undefined") {
    document.title = getDockBadgeDocumentTitle(normalizedCount);
  }

  window.dispatchEvent(
    new CustomEvent(DOCK_BADGE_EVENT_NAME, {
      detail: { count: normalizedCount },
    }),
  );

  const nativeWindow = window as Window & {
    electronAPI?: {
      setDockBadgeCount?: (count: number) => void;
    };
    focusForgeDesktop?: {
      setDockBadgeCount?: (count: number) => void;
    };
    webkit?: {
      messageHandlers?: {
        setDockBadgeCount?: {
          postMessage?: (payload: { count: number }) => void;
        };
      };
    };
  };

  nativeWindow.focusForgeDesktop?.setDockBadgeCount?.(normalizedCount);
  nativeWindow.electronAPI?.setDockBadgeCount?.(normalizedCount);
  nativeWindow.webkit?.messageHandlers?.setDockBadgeCount?.postMessage?.({
    count: normalizedCount,
  });
}
