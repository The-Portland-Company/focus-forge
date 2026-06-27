"use client";

import { useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";

const REALTIME_REFRESH_DEBOUNCE_MS = 700;

type UseTasksRealtimeOptions = {
  /**
   * The signed-in user's id. Realtime is only subscribed when present. The
   * channel is scoped per-user; Row Level Security is still enforced
   * server-side regardless of the client-side project filter.
   */
  userId?: string | null;
  /**
   * Whether the task view is currently active. When false we tear the channel
   * down so we are not holding a websocket open on unrelated views (e.g. chrome
   * only renders, popouts).
   */
  enabled: boolean;
  /**
   * The project ids the caller can currently see (derived from the already
   * loaded projects). Used as the server-side `project_id=in.(...)` filter so we
   * only receive events for accessible projects. RLS remains the source of
   * truth; this filter is purely an optimization.
   */
  projectIds: string[];
  /**
   * Called (debounced) whenever an INSERT/UPDATE/DELETE lands on public.tasks
   * for one of the accessible projects. Should refetch task state.
   */
  onChange: () => void;
};

/**
 * Subscribes to Supabase Realtime postgres_changes on public.tasks so the task
 * list updates near-instantly when tasks are created / updated / completed,
 * instead of refetching on render or focus. Returns whether the realtime channel
 * is currently connected.
 *
 * Modeled on useEmailRealtime: one scoped channel, `enabled` gating, debounced
 * onChange, useEffect cleanup via removeChannel. Re-subscribes only when
 * userId / enabled / the sorted set of project ids changes.
 */
export function useTasksRealtime({
  userId,
  enabled,
  projectIds,
  onChange,
}: UseTasksRealtimeOptions): { connected: boolean } {
  const [connected, setConnected] = useState(false);
  // Keep the latest onChange without re-subscribing when it changes identity.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Stable key for the project id set so the effect only re-subscribes when the
  // actual membership changes, not on every new array identity.
  const sortedProjectIds = [...projectIds].filter(Boolean).sort();
  const projectIdsKey = sortedProjectIds.join(",");

  useEffect(() => {
    if (!enabled || !userId || sortedProjectIds.length === 0) {
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
      .channel(`tasks-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `project_id=in.(${sortedProjectIds.join(",")})`,
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
    // sortedProjectIds is derived from projectIdsKey; depending on the key keeps
    // the effect stable across array identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, enabled, projectIdsKey]);

  return { connected };
}
