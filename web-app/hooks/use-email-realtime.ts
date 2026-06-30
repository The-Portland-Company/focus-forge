"use client";

import { useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import type { EmailThreadRealtimeChange } from "@/lib/email-inbox/apply-realtime-patch";

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
   * Called once per INSERT/UPDATE/DELETE on public.email_threads for this user,
   * with the change payload (REPLICA IDENTITY FULL gives us the full row). The
   * consumer decides whether to patch the changed row in place or refetch.
   */
  onChange: (change: EmailThreadRealtimeChange) => void;
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

    let isActive = true;

    const supabase = createClient();

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
        (payload) => {
          if (!isActive) {
            return;
          }
          // Surface the per-event payload so the consumer can patch the single
          // changed row in place (REPLICA IDENTITY FULL carries the full row),
          // falling back to a targeted hydrate or full refetch as needed.
          onChangeRef.current({
            eventType: payload.eventType as EmailThreadRealtimeChange["eventType"],
            new:
              payload.new && Object.keys(payload.new).length > 0
                ? (payload.new as Record<string, unknown>)
                : null,
            old:
              payload.old && Object.keys(payload.old).length > 0
                ? (payload.old as Record<string, unknown>)
                : null,
          });
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
      void supabase.removeChannel(channel);
    };
  }, [userId, enabled]);

  return { connected };
}
