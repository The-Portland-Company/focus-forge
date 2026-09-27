// Coalesced lifecycle wrapper around provider.ts's watchMailboxForChanges().
//
// Responsibilities kept deliberately narrow:
//  - Debounce bursts of IMAP 'exists'/'expunge' events into a single sync.
//  - Guarantee two syncs for the same mailbox never run concurrently.
//  - Fall back to polling (by handing control back to the caller) when the
//    server doesn't support IDLE, or after IDLE errors repeatedly.
//
// The decision functions below are pure and unit-tested in isolation
// (lib/__tests__/mailbox-watch.test.ts). MailboxWatchManager is the stateful
// glue that drives them from real IDLE events and timers.
import {
  watchMailboxForChanges,
  type MailboxTransportRow,
  type MailboxWatchHandle,
} from "@/lib/email-inbox/provider";

export const DEFAULT_WATCH_DEBOUNCE_MS = 3_000;
export const DEFAULT_MAX_CONSECUTIVE_WATCH_ERRORS = 3;

// --- Debounce / no-overlap state machine (pure) -----------------------

export type MailboxWatchDecisionState = {
  // A debounce timer is currently scheduled and hasn't fired yet.
  timerPending: boolean;
  // A sync triggered by this watcher is currently running.
  syncInFlight: boolean;
  // A change arrived while a timer/sync was already pending or running, so
  // one more sync must run once things settle.
  rerunRequested: boolean;
};

export function initialMailboxWatchDecisionState(): MailboxWatchDecisionState {
  return { timerPending: false, syncInFlight: false, rerunRequested: false };
}

// Called for every 'exists'/'expunge' event the IDLE connection reports.
// A burst of these must collapse into a single pending sync: if a timer is
// already pending, or a sync is already running, this only records that
// another run is wanted once things settle — it never schedules a second
// timer or starts a second sync.
export function onMailboxWatchChangeEvent(
  state: MailboxWatchDecisionState,
): { state: MailboxWatchDecisionState; scheduleTimer: boolean } {
  if (state.syncInFlight) {
    return { state: { ...state, rerunRequested: true }, scheduleTimer: false };
  }
  if (state.timerPending) {
    return { state, scheduleTimer: false };
  }
  return { state: { ...state, timerPending: true }, scheduleTimer: true };
}

// Called when the debounce timer fires.
export function onMailboxWatchDebounceFired(
  state: MailboxWatchDecisionState,
): { state: MailboxWatchDecisionState; runSync: boolean } {
  const next = { ...state, timerPending: false };
  if (state.syncInFlight) {
    // A previous sync (e.g. a slow initial backfill) is still running.
    // Don't start a second, overlapping sync — request a rerun instead.
    return { state: { ...next, rerunRequested: true }, runSync: false };
  }
  return { state: { ...next, syncInFlight: true }, runSync: true };
}

// Called when an in-flight sync settles, success or failure.
export function onMailboxWatchSyncSettled(
  state: MailboxWatchDecisionState,
): { state: MailboxWatchDecisionState; scheduleTimer: boolean } {
  const rerun = state.rerunRequested;
  return {
    state: { timerPending: rerun, syncInFlight: false, rerunRequested: false },
    scheduleTimer: rerun,
  };
}

// --- IDLE-vs-poll fallback state machine (pure) ------------------------

export type MailboxWatchFallbackState = {
  mode: "idle" | "poll";
  consecutiveErrors: number;
};

export function initialMailboxWatchFallbackState(): MailboxWatchFallbackState {
  return { mode: "idle", consecutiveErrors: 0 };
}

// The server told us outright it doesn't support IDLE. There is nothing to
// retry — go straight to poll-only and stay there.
export function decideAfterWatchUnsupported(): MailboxWatchFallbackState {
  return { mode: "poll", consecutiveErrors: 0 };
}

// watchMailboxForChanges() already reconnects transient IMAP drops with its
// own backoff, so a single onError doesn't mean IDLE is dead. Only fall back
// to polling once errors keep happening back-to-back without a successful
// change/session in between.
export function decideAfterWatchError(
  state: MailboxWatchFallbackState,
  maxConsecutiveErrors: number = DEFAULT_MAX_CONSECUTIVE_WATCH_ERRORS,
): MailboxWatchFallbackState {
  const consecutiveErrors = state.consecutiveErrors + 1;
  if (consecutiveErrors >= maxConsecutiveErrors) {
    return { mode: "poll", consecutiveErrors };
  }
  return { mode: state.mode, consecutiveErrors };
}

export function decideAfterWatchChangeObserved(): MailboxWatchFallbackState {
  return { mode: "idle", consecutiveErrors: 0 };
}

// --- Stateful glue --------------------------------------------------

export type MailboxSyncFn = (userId: string, mailboxId: string) => Promise<unknown>;

export type MailboxWatchManagerOptions = {
  // The existing sync entry point to reuse — never duplicate sync logic here.
  runSync: MailboxSyncFn;
  debounceMs?: number;
  maxConsecutiveErrorsBeforeFallback?: number;
  // Called once a mailbox has fallen back to poll-only, so the caller can
  // make sure its regular polling cadence covers this mailbox again.
  onFallbackToPolling?: (mailboxId: string, reason: "unsupported" | "errors") => void;
  onSyncError?: (mailboxId: string, error: unknown) => void;
};

type ActiveWatch = {
  handle: MailboxWatchHandle | null;
  decision: MailboxWatchDecisionState;
  fallback: MailboxWatchFallbackState;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  stopped: boolean;
};

// Owns zero or more live IMAP IDLE watchers, one per mailbox. Not itself tied
// to any process model — see server.ts for why this must be driven by a
// long-lived worker rather than a Next.js route handler.
export class MailboxWatchManager {
  private watches = new Map<string, ActiveWatch>();

  constructor(private options: MailboxWatchManagerOptions) {}

  isWatching(mailboxId: string): boolean {
    return this.watches.has(mailboxId);
  }

  async start(params: {
    userId: string;
    mailboxId: string;
    mailbox: MailboxTransportRow;
    folder?: string;
  }): Promise<void> {
    const { userId, mailboxId, mailbox, folder } = params;
    if (this.watches.has(mailboxId)) return;

    const entry: ActiveWatch = {
      handle: null,
      decision: initialMailboxWatchDecisionState(),
      fallback: initialMailboxWatchFallbackState(),
      debounceTimer: null,
      stopped: false,
    };
    this.watches.set(mailboxId, entry);

    const scheduleDebounce = () => {
      if (entry.stopped) return;
      entry.debounceTimer = setTimeout(() => {
        entry.debounceTimer = null;
        const fired = onMailboxWatchDebounceFired(entry.decision);
        entry.decision = fired.state;
        if (!fired.runSync) return;
        void this.options
          .runSync(userId, mailboxId)
          .catch((error) => this.options.onSyncError?.(mailboxId, error))
          .finally(() => {
            const settled = onMailboxWatchSyncSettled(entry.decision);
            entry.decision = settled.state;
            if (settled.scheduleTimer && !entry.stopped) {
              scheduleDebounce();
            }
          });
      }, this.options.debounceMs ?? DEFAULT_WATCH_DEBOUNCE_MS);
    };

    const handle = await watchMailboxForChanges(mailbox, {
      folder,
      onChange: () => {
        if (entry.stopped) return;
        entry.fallback = decideAfterWatchChangeObserved();
        const result = onMailboxWatchChangeEvent(entry.decision);
        entry.decision = result.state;
        if (result.scheduleTimer) scheduleDebounce();
      },
      onUnsupported: () => {
        entry.fallback = decideAfterWatchUnsupported();
        this.options.onFallbackToPolling?.(mailboxId, "unsupported");
        void this.stop(mailboxId);
      },
      onError: (error) => {
        entry.fallback = decideAfterWatchError(
          entry.fallback,
          this.options.maxConsecutiveErrorsBeforeFallback,
        );
        this.options.onSyncError?.(mailboxId, error);
        if (entry.fallback.mode === "poll") {
          this.options.onFallbackToPolling?.(mailboxId, "errors");
          void this.stop(mailboxId);
        }
      },
    });

    if (entry.stopped) {
      // stop() raced start() (e.g. unsupported fired synchronously-ish
      // before we could store the handle) — close what we just opened.
      await handle.stop().catch(() => {});
      return;
    }
    entry.handle = handle;
  }

  async stop(mailboxId: string): Promise<void> {
    const entry = this.watches.get(mailboxId);
    if (!entry) return;
    entry.stopped = true;
    this.watches.delete(mailboxId);
    if (entry.debounceTimer) {
      clearTimeout(entry.debounceTimer);
      entry.debounceTimer = null;
    }
    if (entry.handle) {
      await entry.handle.stop().catch(() => {});
    }
  }

  async stopAll(): Promise<void> {
    await Promise.all(Array.from(this.watches.keys()).map((id) => this.stop(id)));
  }
}
