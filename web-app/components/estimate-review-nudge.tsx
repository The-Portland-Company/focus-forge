"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { EstimateReviewModal } from "@/components/estimate-review-modal";

const DISMISS_KEY = "estimateNudge:dismissedDate";
const PREF_KEY = "estimateNudge:enabled";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Once-per-day prompt to estimate a small batch of unestimated tasks.
 * Disabled on /estimates (the page does its own thing) and on auth pages.
 */
export function EstimateReviewNudge() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() || "";

  useEffect(() => {
    if (
      pathname.startsWith("/auth") ||
      pathname.startsWith("/login") ||
      pathname.startsWith("/estimates")
    ) {
      return;
    }
    if (typeof window === "undefined") return;
    const enabled = window.localStorage.getItem(PREF_KEY);
    if (enabled === "false") return;
    const dismissed = window.localStorage.getItem(DISMISS_KEY);
    if (dismissed === todayKey()) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/tasks/unestimated?total=1", {
          credentials: "include",
        });
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        if ((json?.total ?? 0) > 0) {
          setOpen(true);
        }
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const handleClose = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISS_KEY, todayKey());
    }
    setOpen(false);
  };

  return (
    <EstimateReviewModal
      isOpen={open}
      onClose={handleClose}
      onCompleted={handleClose}
      batchSize={10}
    />
  );
}
