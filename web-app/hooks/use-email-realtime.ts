"use client";

import { useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";

const REALTIME_REFRESH_DEBOUNCE_MS = 700;

type UseEmailRealtimeOptions = {
  /**
   * The signed-in user's id. Realtime is only subscribed when present. The
   * subscription is filtered to threads owned by this user; Row Level Security
   * is still enforced server-side regardless of the filter.
   */
  userId?: string | null;
  /**
   * Whether the email inbox view is currently active. When false we tear the
   * channel down so we are not holding a websocket open on unrelated views.
   */
  enabled: boolean;
  /**
   * Called (debounced) whenever an INSERT/UPDATE/DELETE lands on
   * public.email_threads for this user. Should refetch the inbox state.
   */
  onChange: () => void;
};

/**
 * Subscribes to Supabase Realtime postgres_changes on public.email_threads so
 * the inbox updates near-instantly when the in-process IMAP IDLE worker writes
 * new rows. Returns whether the realtime channel is currently connected, which
 * the caller can use to lengthen its polling fallback while realtime is live.
 *
 * Resilience: on subscription error / timeout / close, `connected` flips back
 * to false so the caller's existing poll resumes as the fallback. We never own
 * the poll here — realtime is purely additive.
 */
export function useEmailRealtime({
  userId,
  enabled,
  onChange,
}: UseEmailRealtimeOptions): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  // Keep the latest onChange without re-subscribing when it changes identity.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!enabled || !userId) {
      setConnected(false);
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let isActive = true;

    const supabase = createClient();

    const scheduleRefresh = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        if (isActive) {
          onChangeRef.current();
        }
      }, REALTIME_REFRESH_DEBOUNCE_MS);
    };

    const channel = supabase
      .channel(`email-threads-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "email_threads",
          filter: `owner_user_id=eq.${userId}`,
        },
        () => {
          scheduleRefresh();
        },
      )
      .subscribe((status) => {
        if (!isActive) {
          return;
        }

        if (status === "SUBSCRIBED") {
          setConnected(true);
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          // Fall back to polling: the caller keeps its 30s poll running.
          setConnected(false);
        }
      });

    return () => {
      isActive = false;
      setConnected(false);
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      void supabase.removeChannel(channel);
    };
  }, [userId, enabled]);

  return { connected };
}
