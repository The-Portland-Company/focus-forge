"use client";

import { useEffect, useState } from "react";

/**
 * Tailwind's default `md` breakpoint. Below this width the app renders its
 * mobile layout (full-screen modals, stacked panels); at or above it the
 * desktop layout applies. Centralized here so every consumer agrees on the
 * threshold rather than hard-coding `768` in scattered `matchMedia` calls.
 *
 * NOTE: the email inbox uses a separate, wider `min-width:1280px` (`xl`)
 * signal for its two-pane split layout. That is intentional — it needs more
 * horizontal room than the generic mobile/desktop cutoff — so it is not
 * replaced by this hook.
 */
export const MOBILE_BREAKPOINT_PX = 768;

const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`;

/**
 * SSR-safe matchMedia hook. Returns `false` on the server and during the first
 * client render (matching the server output so hydration never mismatches),
 * then updates to the real value on mount and on every breakpoint change.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia(query);
    const sync = (event?: MediaQueryListEvent) => {
      setMatches(event ? event.matches : mediaQuery.matches);
    };

    sync();
    mediaQuery.addEventListener("change", sync);

    return () => {
      mediaQuery.removeEventListener("change", sync);
    };
  }, [query]);

  return matches;
}

/**
 * `true` when the viewport is narrower than the `md` breakpoint (mobile).
 * SSR-safe: defaults to `false` until mounted on the client.
 */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_MEDIA_QUERY);
}
